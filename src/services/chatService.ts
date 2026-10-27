import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import pool from "../db";
import { createHash } from 'node:crypto';
import { CommentService, CommentServiceError, CreateCommentData, StudentComment, toStudentComment } from "./commentService";
import { NotificationHub } from "./notificationHub";

export interface SendMessageData extends CreateCommentData { clientMessageId?: string }
const selectMessage = `SELECT c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
  CONCAT(u.first_name, ' ', u.last_name) AS author_name,
  CONCAT(s.first_name, ' ', s.last_name) AS student_name, s.grade_level AS student_grade
  FROM student_comments c JOIN users u ON u.id=c.author_id JOIN students s ON s.id=c.student_id`;

async function notify(connection: PoolConnection, data: SendMessageData, id: number): Promise<number[]> {
  // Staff see the conversation; parents currently connected to this child receive
  // its messages. Never notify the sender or a disconnected parent.
  const [recipients] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM users WHERE role IN ('admin','teacher')
     UNION SELECT user_id AS id FROM parent_students WHERE student_id=?`, [data.studentId]);
  const ids = [...new Set(recipients.map((r) => Number(r.id)))].filter((userId) => userId !== data.authorId);
  for (const userId of ids) {
    const [insert] = await connection.execute<ResultSetHeader>(
      `INSERT INTO notifications (recipient_user_id, actor_user_id, type, title, message, student_id, comment_id, comment_date, dedupe_key)
       VALUES (?, ?, ?, 'Nova poruka', 'Imate novu poruku u aplikaciji.', ?, ?, ?, ?)`,
      [userId, data.authorId, data.parentCommentId ? 'COMMENT_REPLIED' : 'COMMENT_ADDED', data.studentId, id, data.date, `comment:${id}`]);
    await connection.execute(
      `INSERT INTO push_deliveries (notification_id, subscription_id, session_id)
       SELECT ?, p.id, p.session_id FROM push_subscriptions p JOIN auth_sessions a ON a.id=p.session_id
       WHERE p.user_id=? AND a.revoked_at IS NULL AND a.expires_at>CURRENT_TIMESTAMP(3)`, [insert.insertId, userId]);
  }
  return ids;
}

export class ChatService {
  static async conversations(userId:number,role:string,search:string,offset:number,studentId?:number,unreadOnly=false) {
    const conditions:string[]=[]; const values:(number|string)[]=[];
    if(!['admin','teacher'].includes(role)) {conditions.push('EXISTS (SELECT 1 FROM parent_students ps WHERE ps.student_id=s.id AND ps.user_id=?)');values.push(userId);}
    if(search) {conditions.push("CONCAT(s.first_name,' ',s.last_name) LIKE ?");values.push(`%${search.replace(/[\\%_]/g,'\\$&')}%`);}
    if(studentId){conditions.push('s.id=?');values.push(studentId);}
    if(unreadOnly){conditions.push('EXISTS (SELECT 1 FROM notifications un JOIN student_comments uc ON uc.id=un.comment_id WHERE un.student_id=s.id AND un.recipient_user_id=? AND un.is_read=0 AND uc.deleted_at IS NULL)');values.push(userId);}
    const [rows]=await pool.query<RowDataPacket[]>(`SELECT s.id AS student_id,CONCAT(s.first_name,' ',s.last_name) AS student_name,s.grade_level,
      c.id AS last_message_id,c.content AS preview,c.deleted_at,c.created_at AS last_message_at,
      (SELECT COUNT(*) FROM notifications n JOIN student_comments nc ON nc.id=n.comment_id
       WHERE n.recipient_user_id=? AND n.student_id=s.id AND n.is_read=0 AND nc.deleted_at IS NULL) AS unread_count
      FROM students s LEFT JOIN student_comments c ON c.id=(SELECT MAX(sc.id) FROM student_comments sc WHERE sc.student_id=s.id)
      ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY c.id DESC,s.id DESC LIMIT 51 OFFSET ${offset}`,[userId,...values]);
    const {keysToCamelCase}=await import('../utils/caseConverter');
    return {conversations:rows.slice(0,50).map(row=>keysToCamelCase(row)),hasMore:rows.length>50};
  }

  static async markRead(studentId:number,userId:number,throughId:number) {
    await pool.execute(`UPDATE notifications SET is_read=1,read_at=CURRENT_TIMESTAMP WHERE recipient_user_id=? AND student_id=? AND comment_id<=? AND is_read=0`,[userId,studentId,throughId]);
    NotificationHub.notifyUser(userId,'notification:update');
  }

  static async send(data: SendMessageData, retry = 0): Promise<StudentComment> {
    const requestHash = createHash('sha256').update(JSON.stringify([data.studentId, data.content, data.date, data.parentCommentId ?? null])).digest('hex');
    const connection = await pool.getConnection();
    let id = 0, recipients: number[] = [], duplicate = false;
    try {
      await connection.beginTransaction();
      // Shared row locks supported by both MySQL 8 and MariaDB 10.11.
      const [students] = await connection.execute<RowDataPacket[]>("SELECT id FROM students WHERE id=? LOCK IN SHARE MODE", [data.studentId]);
      if (!students.length) throw new CommentServiceError("Student not found", 404);
      if (data.authorRole === 'parent') {
        const [links] = await connection.execute<RowDataPacket[]>("SELECT id FROM parent_students WHERE user_id=? AND student_id=? LOCK IN SHARE MODE", [data.authorId, data.studentId]);
        if (!links.length) throw new CommentServiceError("Access denied for this student", 403);
      }
      if (data.parentCommentId) {
        const [parents] = await connection.execute<RowDataPacket[]>("SELECT student_id, DATE_FORMAT(date, '%Y-%m-%d') AS date FROM student_comments WHERE id=? LOCK IN SHARE MODE", [data.parentCommentId]);
        if (!parents.length || parents[0].student_id !== data.studentId || parents[0].date !== data.date) throw new CommentServiceError("Invalid reply target", 400);
      }
      if (data.clientMessageId) {
        const [existing] = await connection.execute<RowDataPacket[]>("SELECT id, request_hash FROM student_comments WHERE author_id=? AND client_message_id=?", [data.authorId, data.clientMessageId]);
        if (existing.length) {
          const row = existing[0];
          if (row.request_hash !== requestHash) throw new CommentServiceError("Message ID was already used for different content", 409);
          id = row.id;
        }
      }
      if (!id) {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO student_comments (student_id, author_id, author_role, content, date, parent_comment_id, client_message_id, request_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [data.studentId, data.authorId, data.authorRole, data.content, data.date, data.parentCommentId ?? null, data.clientMessageId ?? null, data.clientMessageId ? requestHash : null]);
        id = result.insertId;
        recipients = await notify(connection, data, id);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      // Two concurrent requests may both miss the initial receipt lookup. The
      // unique key decides the winner; retry reads the committed receipt.
      if (['ER_DUP_ENTRY','ER_LOCK_DEADLOCK'].includes((error as { code?: string }).code ?? '') && data.clientMessageId && retry < 2) duplicate = true;
      else throw error;
    } finally { connection.release(); }
    if (duplicate) return this.send(data, retry + 1);
    NotificationHub.notifyUsers(recipients, 'notification:new');
    return CommentService.getCommentById(id);
  }

  static async messages(studentId: number, options: { before?: number; date?: string; limit: number }) {
    const conditions = ['c.student_id=?'];
    const values: (number | string)[] = [studentId];
    if (options.before) { conditions.push('c.id<?'); values.push(options.before); }
    if (options.date) { conditions.push('c.date=?'); values.push(options.date); }
    const [rows] = await pool.query<RowDataPacket[]>(`${selectMessage} WHERE ${conditions.join(' AND ')} ORDER BY c.id DESC LIMIT ${options.limit + 1}`, values);
    const hasMore = rows.length > options.limit;
    const messages = rows.slice(0, options.limit).reverse().map(toStudentComment);
    return { messages, hasMore, nextCursor: hasMore ? messages[0].id : null };
  }
}

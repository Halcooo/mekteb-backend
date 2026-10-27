import pool from "../db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { keysToCamelCase } from "../utils/caseConverter";
import { NotificationHub } from "./notificationHub";
import { normalizeDateOnlyInput } from "../utils/dateInput";

export type NotificationType = "COMMENT_ADDED" | "COMMENT_REPLIED";

export interface Notification {
  id: number;
  recipientUserId: number;
  actorUserId: number | null;
  type: NotificationType;
  title: string;
  message: string;
  studentId: number | null;
  commentId: number | null;
  commentDate: string | null;
  isRead: number;
  readAt: string | null;
  createdAt: string;
  actorUsername?: string;
  studentName?: string;
}

export interface CreateNotificationsInput {
  recipientUserIds: number[];
  actorUserId?: number;
  type: NotificationType;
  title: string;
  message: string;
  studentId?: number;
  commentId?: number;
  commentDate?: string;
}

const visible = ` AND (n.comment_id IS NULL OR EXISTS (SELECT 1 FROM student_comments c WHERE c.id=n.comment_id AND c.deleted_at IS NULL))
 AND (n.student_id IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id=n.recipient_user_id AND u.role IN ('admin','teacher'))
 OR EXISTS (SELECT 1 FROM parent_students ps WHERE ps.student_id=n.student_id AND ps.user_id=n.recipient_user_id))`;
export class NotificationService {
  static async getById(id: number, userId: number): Promise<Notification | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT n.* FROM notifications n WHERE n.id=? AND n.recipient_user_id=? ${visible}`, [id,userId]);
    return rows[0] ? keysToCamelCase<Notification>(rows[0]) : null;
  }
  /** @deprecated Chat messages must create inbox entries and jobs inside ChatService's transaction. */
  static async createForUsers(input: CreateNotificationsInput): Promise<void> {
    const uniqueRecipientIds = Array.from(
      new Set(input.recipientUserIds),
    ).filter((id) => Number.isInteger(id) && id > 0);

    if (uniqueRecipientIds.length === 0) {
      return;
    }

    const values = uniqueRecipientIds
      .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
      .join(",");
    const params: Array<number | string | null> = [];
    const normalizedCommentDate = normalizeDateOnlyInput(input.commentDate);

    uniqueRecipientIds.forEach((recipientUserId) => {
      params.push(recipientUserId);
      params.push(input.actorUserId ?? null);
      params.push(input.type);
      params.push(input.title);
      params.push(input.message);
      params.push(input.studentId ?? null);
      params.push(input.commentId ?? null);
      params.push(normalizedCommentDate ?? null);
    });

    const query = `
      INSERT INTO notifications (
        recipient_user_id,
        actor_user_id,
        type,
        title,
        message,
        student_id,
        comment_id,
        comment_date
      ) VALUES ${values}
    `;

    await pool.execute(query, params);
    NotificationHub.notifyUsers(uniqueRecipientIds, "notification:new");
  }

  static async getUserNotifications(
    userId: number,
    limit = 30,
    unreadOnly = false,
  ): Promise<Notification[]> {
    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 30;

    let query = `
      SELECT
        n.*,
        au.username AS actor_username,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name
      FROM notifications n
      LEFT JOIN users au ON au.id = n.actor_user_id
      LEFT JOIN students s ON s.id = n.student_id
      WHERE n.recipient_user_id = ? ${visible}
    `;

    const params: Array<number> = [userId];

    if (unreadOnly) {
      query += " AND n.is_read = 0";
    }

    query += ` ORDER BY n.created_at DESC LIMIT ${safeLimit}`;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows.map((row) => keysToCamelCase<Notification>(row));
  }

  static async getUnreadCount(userId: number): Promise<number> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as unread_count
       FROM notifications n
       WHERE recipient_user_id = ? AND is_read = 0 ${visible}`,
      [userId],
    );

    return Number(rows[0]?.unread_count || 0);
  }

  static async markAsRead(
    notificationId: number,
    userId: number,
  ): Promise<boolean> {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE notifications n
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND recipient_user_id = ? ${visible}`,
      [notificationId, userId],
    );

    const updated = result.affectedRows > 0;
    if (updated) {
      NotificationHub.notifyUser(userId, "notification:update");
    }

    return updated;
  }

  static async markAllAsRead(userId: number): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE notifications n
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE recipient_user_id = ? AND is_read = 0 ${visible}`,
      [userId],
    );

    if (result.affectedRows > 0) {
      NotificationHub.notifyUser(userId, "notification:update");
    }

    return result.affectedRows;
  }
}

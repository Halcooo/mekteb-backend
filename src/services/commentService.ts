import pool from "../db";
import { keysToCamelCase } from "../utils/caseConverter";
import { normalizeDateOnlyInput } from "../utils/dateInput";

export interface StudentComment {
  id: number;
  studentId: number;
  authorId: number;
  authorRole: "admin" | "teacher" | "parent";
  content: string;
  date: string; // YYYY-MM-DD format
  parentCommentId?: number;
  createdAt: string;
  updatedAt?: string;
  clientMessageId?: string;
  deletedAt?: string | null;
  editedAt?: string | null;
  // Additional fields from joins
  authorName?: string;
  studentName?: string;
  studentGrade?: string;
  repliesCount?: number;
}

export interface CreateCommentData {
  studentId: number;
  authorId: number;
  authorRole: "admin" | "teacher" | "parent";
  content: string;
  date: string;
  parentCommentId?: number;
  clientMessageId?: string;
}

export interface UpdateCommentData {
  content: string;
}

export interface CommentAccess {
  id: number;
  studentId: number;
  authorId: number;
  date: string;
}

// Never expose the original request fingerprint (including after soft deletion).
export function toStudentComment(row: unknown): StudentComment {
  const value=keysToCamelCase<StudentComment>(row);
  const timestamp=(input:unknown)=>input instanceof Date?input.toISOString():String(input);
  return {
    id:value.id,studentId:value.studentId,authorId:value.authorId,authorRole:value.authorRole,
    content:value.content,date:value.date,parentCommentId:value.parentCommentId,
    createdAt:timestamp(value.createdAt),updatedAt:value.updatedAt?timestamp(value.updatedAt):undefined,
    authorName:value.authorName,studentName:value.studentName,studentGrade:value.studentGrade,
    repliesCount:value.repliesCount,clientMessageId:value.clientMessageId,
    deletedAt:value.deletedAt?timestamp(value.deletedAt):null,editedAt:value.editedAt?timestamp(value.editedAt):null,
  };
}

export class CommentServiceError extends Error {
  constructor(message: string, public readonly status: 400 | 401 | 403 | 404 | 409) {
    super(message);
  }
}

export class CommentService {
  // Resolve ownership without reading another student's message content.
  static async getCommentAccessById(id: number): Promise<CommentAccess> {
    const [rows] = await pool.execute(
      `SELECT id, student_id, author_id, DATE_FORMAT(date, '%Y-%m-%d') AS date
       FROM student_comments WHERE id = ?`,
      [id],
    );
    const row = (rows as any[])[0];
    if (!row) {
      throw new CommentServiceError("Comment not found", 404);
    }
    return keysToCamelCase<CommentAccess>(row);
  }

  // Get comments for a student on a specific date
  static async getStudentComments(
    studentId: number,
    date?: string,
    authorRole?: string,
  ): Promise<StudentComment[]> {
    try {
      let query = `
        SELECT 
          c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
          CONCAT(u.first_name, ' ', u.last_name) as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        WHERE c.student_id = ?
      `;

      const params: any[] = [studentId];
      const normalizedDate = normalizeDateOnlyInput(date);

      if (normalizedDate) {
        query += " AND c.date = ?";
        params.push(normalizedDate);
      }

      if (authorRole) {
        query += " AND c.author_role = ?";
        params.push(authorRole);
      }

      query +=
        " ORDER BY c.date DESC, c.created_at ASC, c.parent_comment_id IS NULL DESC";

      const [rows] = await pool.execute(query, params);

      return (rows as any[]).map((row) => toStudentComment(row));
    } catch (error) {
      console.error("Error fetching student comments:", error);
      throw new Error("Failed to fetch student comments");
    }
  }

  // Get all comments for a specific date (admin view)
  static async getDailyComments(date: string): Promise<StudentComment[]> {
    try {
      const normalizedDate = normalizeDateOnlyInput(date);
      if (!normalizedDate) {
        throw new Error("Invalid date format");
      }

      const query = `
        SELECT 
          c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
          CONCAT(u.first_name, ' ', u.last_name) as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        WHERE c.date = ?
        ORDER BY s.grade_level, s.last_name, s.first_name, c.created_at ASC
      `;

      const [rows] = await pool.execute(query, [normalizedDate]);

      return (rows as any[]).map((row) => toStudentComment(row));
    } catch (error) {
      console.error("Error fetching daily comments:", error);
      throw new Error("Failed to fetch daily comments");
    }
  }

  // Get comments by various filters
  static async getComments(filters: {
    studentId?: number;
    date?: string;
    authorRole?: string;
    parentCommentId?: number;
    page?: number;
    limit?: number;
  }): Promise<{ comments: StudentComment[]; total: number }> {
    try {
      const {
        studentId,
        date,
        authorRole,
        parentCommentId,
        page = 1,
        limit = 50,
      } = filters;
      const normalizedDate = normalizeDateOnlyInput(date);

      let whereConditions: string[] = [];
      let params: any[] = [];

      if (studentId) {
        whereConditions.push("c.student_id = ?");
        params.push(studentId);
      }

      if (normalizedDate) {
        whereConditions.push("c.date = ?");
        params.push(normalizedDate);
      }

      if (authorRole) {
        whereConditions.push("c.author_role = ?");
        params.push(authorRole);
      }

      if (parentCommentId !== undefined) {
        if (parentCommentId === null) {
          whereConditions.push("c.parent_comment_id IS NULL");
        } else {
          whereConditions.push("c.parent_comment_id = ?");
          params.push(parentCommentId);
        }
      }

      const whereClause =
        whereConditions.length > 0
          ? "WHERE " + whereConditions.join(" AND ")
          : "";

      // Count total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        ${whereClause}
      `;

      const [countRows] = await pool.execute(countQuery, params);
      const total = (countRows as any[])[0].total;

      // Get paginated results
      const offset = (page - 1) * limit;
      const query = `
        SELECT 
          c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
          CONCAT(u.first_name, ' ', u.last_name) as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        ${whereClause}
        ORDER BY c.date DESC, c.created_at ASC
        LIMIT ? OFFSET ?
      `;

      const [rows] = await pool.execute(query, [...params, limit, offset]);

      const comments = (rows as any[]).map((row) =>
        toStudentComment(row),
      );

      return { comments, total };
    } catch (error) {
      console.error("Error fetching comments:", error);
      throw new Error("Failed to fetch comments");
    }
  }

  // Messages, recipient inbox entries and push jobs commit together.
  static async createComment(commentData: CreateCommentData): Promise<StudentComment> {
    const { ChatService } = await import('./chatService');
    return ChatService.send(commentData);
  }
  // Get comment by ID
  static async getCommentById(id: number): Promise<StudentComment> {
    try {
      const query = `
        SELECT 
          c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
          CONCAT(u.first_name, ' ', u.last_name) as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        WHERE c.id = ?
      `;

      const [rows] = await pool.execute(query, [id]);

      if ((rows as any[]).length === 0) {
        throw new CommentServiceError("Comment not found", 404);
      }

      return toStudentComment((rows as any[])[0]);
    } catch (error) {
      if (error instanceof CommentServiceError) throw error;
      console.error("Error fetching comment by ID:", error);
      throw new Error("Failed to fetch comment");
    }
  }

  // Update a comment
  static async updateComment(
    id: number,
    updateData: UpdateCommentData,
    authorId: number,
    isAdmin = false,
  ): Promise<StudentComment> {
    try {
      // First check if the comment exists and belongs to the author
      const existingComment = await this.getCommentAccessById(id);

      if (existingComment.authorId !== authorId && !isAdmin) {
        throw new CommentServiceError("Unauthorized to update this comment", 403);
      }

      const query = `
        UPDATE student_comments 
        SET content = ?, edited_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL AND (author_id = ? OR ? = 1)
      `;

      const [result] = await pool.execute(query, [updateData.content, id, authorId, isAdmin]);
      if ((result as {affectedRows:number}).affectedRows === 0) throw new CommentServiceError('Comment not found',404);

      return await this.getCommentById(id);
    } catch (error) {
      if (error instanceof CommentServiceError) throw error;
      console.error("Error updating comment:", error);
      throw new Error("Failed to update comment");
    }
  }

  // Delete a comment
  static async deleteComment(id: number, authorId: number, isAdmin = false): Promise<void> {
    try {
      // First check if the comment exists and belongs to the author
      const existingComment = await this.getCommentAccessById(id);

      if (existingComment.authorId !== authorId && !isAdmin) {
        throw new CommentServiceError("Unauthorized to delete this comment", 403);
      }

      const query =
        "UPDATE student_comments SET content = '[deleted]', deleted_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL AND (author_id = ? OR ? = 1)";

      const [result] = await pool.execute(query, [id, authorId, isAdmin]);

      if ((result as any).affectedRows === 0) {
        throw new CommentServiceError("Comment not found", 404);
      }
    } catch (error) {
      if (error instanceof CommentServiceError) throw error;
      console.error("Error deleting comment:", error);
      throw new Error("Failed to delete comment");
    }
  }

  // Get comment thread (parent comment + all replies)
  static async getCommentThread(
    parentCommentId: number,
    studentId: number,
  ): Promise<StudentComment[]> {
    try {
      const query = `
        SELECT 
          c.*, DATE_FORMAT(c.date, '%Y-%m-%d') AS date,
          CONCAT(u.first_name, ' ', u.last_name) as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        WHERE c.student_id = ? AND (c.id = ? OR c.parent_comment_id = ?)
        ORDER BY c.parent_comment_id IS NULL DESC, c.created_at ASC
      `;

      const [rows] = await pool.execute(query, [
        studentId,
        parentCommentId,
        parentCommentId,
      ]);

      return (rows as any[]).map((row) => toStudentComment(row));
    } catch (error) {
      console.error("Error fetching comment thread:", error);
      throw new Error("Failed to fetch comment thread");
    }
  }
}

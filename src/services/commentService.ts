import pool from "../db.js";
import { keysToCamelCase, keysToSnakeCase } from "../utils/caseConverter.js";

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
}

export interface UpdateCommentData {
  content: string;
}

export class CommentService {
  // Get comments for a student on a specific date
  static async getStudentComments(
    studentId: number,
    date?: string,
    authorRole?: string
  ): Promise<StudentComment[]> {
    try {
      let query = `
        SELECT 
          c.*,
          u.username as author_name,
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

      if (date) {
        query += " AND c.date = ?";
        params.push(date);
      }

      if (authorRole) {
        query += " AND c.author_role = ?";
        params.push(authorRole);
      }

      query +=
        " ORDER BY c.date DESC, c.created_at ASC, c.parent_comment_id IS NULL DESC";

      const [rows] = await pool.execute(query, params);

      return (rows as any[]).map((row) => keysToCamelCase<StudentComment>(row));
    } catch (error) {
      console.error("Error fetching student comments:", error);
      throw new Error("Failed to fetch student comments");
    }
  }

  // Get all comments for a specific date (admin view)
  static async getDailyComments(date: string): Promise<StudentComment[]> {
    try {
      const query = `
        SELECT 
          c.*,
          u.username as author_name,
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

      const [rows] = await pool.execute(query, [date]);

      return (rows as any[]).map((row) => keysToCamelCase<StudentComment>(row));
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

      let whereConditions: string[] = [];
      let params: any[] = [];

      if (studentId) {
        whereConditions.push("c.student_id = ?");
        params.push(studentId);
      }

      if (date) {
        whereConditions.push("c.date = ?");
        params.push(date);
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
          c.*,
          u.username as author_name,
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
        keysToCamelCase<StudentComment>(row)
      );

      return { comments, total };
    } catch (error) {
      console.error("Error fetching comments:", error);
      throw new Error("Failed to fetch comments");
    }
  }

  // Create a new comment
  static async createComment(
    commentData: CreateCommentData
  ): Promise<StudentComment> {
    try {
      const dbData = keysToSnakeCase(commentData) as any;

      const query = `
        INSERT INTO student_comments 
        (student_id, author_id, author_role, content, date, parent_comment_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const [result] = await pool.execute(query, [
        commentData.studentId,
        commentData.authorId,
        commentData.authorRole,
        commentData.content,
        commentData.date,
        commentData.parentCommentId || null,
      ]);

      const insertId = (result as any).insertId;
      return await this.getCommentById(insertId);
    } catch (error) {
      console.error("Error creating comment:", error);
      throw new Error("Failed to create comment");
    }
  }

  // Get comment by ID
  static async getCommentById(id: number): Promise<StudentComment> {
    try {
      const query = `
        SELECT 
          c.*,
          u.username as author_name,
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
        throw new Error("Comment not found");
      }

      return keysToCamelCase<StudentComment>((rows as any[])[0]);
    } catch (error) {
      console.error("Error fetching comment by ID:", error);
      throw new Error("Failed to fetch comment");
    }
  }

  // Update a comment
  static async updateComment(
    id: number,
    updateData: UpdateCommentData,
    authorId: number
  ): Promise<StudentComment> {
    try {
      // First check if the comment exists and belongs to the author
      const existingComment = await this.getCommentById(id);

      if (existingComment.authorId !== authorId) {
        throw new Error("Unauthorized to update this comment");
      }

      const query = `
        UPDATE student_comments 
        SET content = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND author_id = ?
      `;

      await pool.execute(query, [updateData.content, id, authorId]);

      return await this.getCommentById(id);
    } catch (error) {
      console.error("Error updating comment:", error);
      throw new Error("Failed to update comment");
    }
  }

  // Delete a comment
  static async deleteComment(id: number, authorId: number): Promise<void> {
    try {
      // First check if the comment exists and belongs to the author
      const existingComment = await this.getCommentById(id);

      if (existingComment.authorId !== authorId) {
        throw new Error("Unauthorized to delete this comment");
      }

      const query =
        "DELETE FROM student_comments WHERE id = ? AND author_id = ?";

      const [result] = await pool.execute(query, [id, authorId]);

      if ((result as any).affectedRows === 0) {
        throw new Error("Comment not found or not authorized");
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      throw new Error("Failed to delete comment");
    }
  }

  // Get comment thread (parent comment + all replies)
  static async getCommentThread(
    parentCommentId: number
  ): Promise<StudentComment[]> {
    try {
      const query = `
        SELECT 
          c.*,
          u.username as author_name,
          s.first_name,
          s.last_name,
          s.grade_level,
          CONCAT(s.first_name, ' ', s.last_name) as student_name,
          s.grade_level as student_grade,
          (SELECT COUNT(*) FROM student_comments sc WHERE sc.parent_comment_id = c.id) as replies_count
        FROM student_comments c
        JOIN users u ON c.author_id = u.id
        JOIN students s ON c.student_id = s.id
        WHERE c.id = ? OR c.parent_comment_id = ?
        ORDER BY c.parent_comment_id IS NULL DESC, c.created_at ASC
      `;

      const [rows] = await pool.execute(query, [
        parentCommentId,
        parentCommentId,
      ]);

      return (rows as any[]).map((row) => keysToCamelCase<StudentComment>(row));
    } catch (error) {
      console.error("Error fetching comment thread:", error);
      throw new Error("Failed to fetch comment thread");
    }
  }
}

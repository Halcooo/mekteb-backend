"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentService = void 0;
const db_1 = __importDefault(require("../db"));
const caseConverter_1 = require("../utils/caseConverter");
class CommentService {
    // Get comments for a student on a specific date
    static async getStudentComments(studentId, date, authorRole) {
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
            const params = [studentId];
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
            const [rows] = await db_1.default.execute(query, params);
            return rows.map((row) => (0, caseConverter_1.keysToCamelCase)(row));
        }
        catch (error) {
            console.error("Error fetching student comments:", error);
            throw new Error("Failed to fetch student comments");
        }
    }
    // Get all comments for a specific date (admin view)
    static async getDailyComments(date) {
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
            const [rows] = await db_1.default.execute(query, [date]);
            return rows.map((row) => (0, caseConverter_1.keysToCamelCase)(row));
        }
        catch (error) {
            console.error("Error fetching daily comments:", error);
            throw new Error("Failed to fetch daily comments");
        }
    }
    // Get comments by various filters
    static async getComments(filters) {
        try {
            const { studentId, date, authorRole, parentCommentId, page = 1, limit = 50, } = filters;
            let whereConditions = [];
            let params = [];
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
                }
                else {
                    whereConditions.push("c.parent_comment_id = ?");
                    params.push(parentCommentId);
                }
            }
            const whereClause = whereConditions.length > 0
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
            const [countRows] = await db_1.default.execute(countQuery, params);
            const total = countRows[0].total;
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
            const [rows] = await db_1.default.execute(query, [...params, limit, offset]);
            const comments = rows.map((row) => (0, caseConverter_1.keysToCamelCase)(row));
            return { comments, total };
        }
        catch (error) {
            console.error("Error fetching comments:", error);
            throw new Error("Failed to fetch comments");
        }
    }
    // Create a new comment
    static async createComment(commentData) {
        try {
            const dbData = (0, caseConverter_1.keysToSnakeCase)(commentData);
            const query = `
        INSERT INTO student_comments 
        (student_id, author_id, author_role, content, date, parent_comment_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
            const [result] = await db_1.default.execute(query, [
                commentData.studentId,
                commentData.authorId,
                commentData.authorRole,
                commentData.content,
                commentData.date,
                commentData.parentCommentId || null,
            ]);
            const insertId = result.insertId;
            return await this.getCommentById(insertId);
        }
        catch (error) {
            console.error("Error creating comment:", error);
            throw new Error("Failed to create comment");
        }
    }
    // Get comment by ID
    static async getCommentById(id) {
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
            const [rows] = await db_1.default.execute(query, [id]);
            if (rows.length === 0) {
                throw new Error("Comment not found");
            }
            return (0, caseConverter_1.keysToCamelCase)(rows[0]);
        }
        catch (error) {
            console.error("Error fetching comment by ID:", error);
            throw new Error("Failed to fetch comment");
        }
    }
    // Update a comment
    static async updateComment(id, updateData, authorId) {
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
            await db_1.default.execute(query, [updateData.content, id, authorId]);
            return await this.getCommentById(id);
        }
        catch (error) {
            console.error("Error updating comment:", error);
            throw new Error("Failed to update comment");
        }
    }
    // Delete a comment
    static async deleteComment(id, authorId) {
        try {
            // First check if the comment exists and belongs to the author
            const existingComment = await this.getCommentById(id);
            if (existingComment.authorId !== authorId) {
                throw new Error("Unauthorized to delete this comment");
            }
            const query = "DELETE FROM student_comments WHERE id = ? AND author_id = ?";
            const [result] = await db_1.default.execute(query, [id, authorId]);
            if (result.affectedRows === 0) {
                throw new Error("Comment not found or not authorized");
            }
        }
        catch (error) {
            console.error("Error deleting comment:", error);
            throw new Error("Failed to delete comment");
        }
    }
    // Get comment thread (parent comment + all replies)
    static async getCommentThread(parentCommentId) {
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
            const [rows] = await db_1.default.execute(query, [
                parentCommentId,
                parentCommentId,
            ]);
            return rows.map((row) => (0, caseConverter_1.keysToCamelCase)(row));
        }
        catch (error) {
            console.error("Error fetching comment thread:", error);
            throw new Error("Failed to fetch comment thread");
        }
    }
}
exports.CommentService = CommentService;

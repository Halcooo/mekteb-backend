"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentService = exports.CommentServiceError = void 0;
exports.toStudentComment = toStudentComment;
const db_1 = __importDefault(require("../db"));
const caseConverter_1 = require("../utils/caseConverter");
const dateInput_1 = require("../utils/dateInput");
// Never expose the original request fingerprint (including after soft deletion).
function toStudentComment(row) {
    const value = (0, caseConverter_1.keysToCamelCase)(row);
    const timestamp = (input) => input instanceof Date ? input.toISOString() : String(input);
    return {
        id: value.id, studentId: value.studentId, authorId: value.authorId, authorRole: value.authorRole,
        content: value.content, date: value.date, parentCommentId: value.parentCommentId,
        createdAt: timestamp(value.createdAt), updatedAt: value.updatedAt ? timestamp(value.updatedAt) : undefined,
        authorName: value.authorName, studentName: value.studentName, studentGrade: value.studentGrade,
        repliesCount: value.repliesCount, clientMessageId: value.clientMessageId,
        deletedAt: value.deletedAt ? timestamp(value.deletedAt) : null, editedAt: value.editedAt ? timestamp(value.editedAt) : null,
    };
}
class CommentServiceError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
exports.CommentServiceError = CommentServiceError;
class CommentService {
    // Resolve ownership without reading another student's message content.
    static async getCommentAccessById(id) {
        const [rows] = await db_1.default.execute(`SELECT id, student_id, author_id, DATE_FORMAT(date, '%Y-%m-%d') AS date
       FROM student_comments WHERE id = ?`, [id]);
        const row = rows[0];
        if (!row) {
            throw new CommentServiceError("Comment not found", 404);
        }
        return (0, caseConverter_1.keysToCamelCase)(row);
    }
    // Get comments for a student on a specific date
    static async getStudentComments(studentId, date, authorRole) {
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
            const params = [studentId];
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
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
            const [rows] = await db_1.default.execute(query, params);
            return rows.map((row) => toStudentComment(row));
        }
        catch (error) {
            console.error("Error fetching student comments:", error);
            throw new Error("Failed to fetch student comments");
        }
    }
    // Get all comments for a specific date (admin view)
    static async getDailyComments(date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
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
            const [rows] = await db_1.default.execute(query, [normalizedDate]);
            return rows.map((row) => toStudentComment(row));
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
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            let whereConditions = [];
            let params = [];
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
            const [rows] = await db_1.default.execute(query, [...params, limit, offset]);
            const comments = rows.map((row) => toStudentComment(row));
            return { comments, total };
        }
        catch (error) {
            console.error("Error fetching comments:", error);
            throw new Error("Failed to fetch comments");
        }
    }
    // Messages, recipient inbox entries and push jobs commit together.
    static async createComment(commentData) {
        const { ChatService } = await Promise.resolve().then(() => __importStar(require('./chatService')));
        return ChatService.send(commentData);
    }
    // Get comment by ID
    static async getCommentById(id) {
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
            const [rows] = await db_1.default.execute(query, [id]);
            if (rows.length === 0) {
                throw new CommentServiceError("Comment not found", 404);
            }
            return toStudentComment(rows[0]);
        }
        catch (error) {
            if (error instanceof CommentServiceError)
                throw error;
            console.error("Error fetching comment by ID:", error);
            throw new Error("Failed to fetch comment");
        }
    }
    // Update a comment
    static async updateComment(id, updateData, authorId, isAdmin = false) {
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
            const [result] = await db_1.default.execute(query, [updateData.content, id, authorId, isAdmin]);
            if (result.affectedRows === 0)
                throw new CommentServiceError('Comment not found', 404);
            return await this.getCommentById(id);
        }
        catch (error) {
            if (error instanceof CommentServiceError)
                throw error;
            console.error("Error updating comment:", error);
            throw new Error("Failed to update comment");
        }
    }
    // Delete a comment
    static async deleteComment(id, authorId, isAdmin = false) {
        try {
            // First check if the comment exists and belongs to the author
            const existingComment = await this.getCommentAccessById(id);
            if (existingComment.authorId !== authorId && !isAdmin) {
                throw new CommentServiceError("Unauthorized to delete this comment", 403);
            }
            const query = "UPDATE student_comments SET content = '[deleted]', deleted_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL AND (author_id = ? OR ? = 1)";
            const [result] = await db_1.default.execute(query, [id, authorId, isAdmin]);
            if (result.affectedRows === 0) {
                throw new CommentServiceError("Comment not found", 404);
            }
        }
        catch (error) {
            if (error instanceof CommentServiceError)
                throw error;
            console.error("Error deleting comment:", error);
            throw new Error("Failed to delete comment");
        }
    }
    // Get comment thread (parent comment + all replies)
    static async getCommentThread(parentCommentId, studentId) {
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
            const [rows] = await db_1.default.execute(query, [
                studentId,
                parentCommentId,
                parentCommentId,
            ]);
            return rows.map((row) => toStudentComment(row));
        }
        catch (error) {
            console.error("Error fetching comment thread:", error);
            throw new Error("Failed to fetch comment thread");
        }
    }
}
exports.CommentService = CommentService;

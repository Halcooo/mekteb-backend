"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentController = void 0;
const commentService_1 = require("../services/commentService");
const parentService_1 = require("../services/parentService");
const dateInput_1 = require("../utils/dateInput");
const STAFF_ROLES = ["admin", "teacher"];
const PARENT_ROLES = ["parent", "user"];
const COMMENT_ROLES = ["admin", "teacher", "parent"];
function requireCommentUser(req) {
    if (!req.user)
        throw new commentService_1.CommentServiceError("Authentication required", 401);
    if (![...STAFF_ROLES, ...PARENT_ROLES].includes(req.user.role)) {
        throw new commentService_1.CommentServiceError("Access denied", 403);
    }
    return req.user;
}
function positiveInteger(value, label) {
    if ((typeof value !== "string" && typeof value !== "number") ||
        (typeof value === "string" && !/^[1-9]\d*$/.test(value))) {
        throw new commentService_1.CommentServiceError(`Invalid ${label}`, 400);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new commentService_1.CommentServiceError(`Invalid ${label}`, 400);
    }
    return parsed;
}
function validDate(value) {
    if (!(0, dateInput_1.isDateOnlyInput)(value)) {
        throw new commentService_1.CommentServiceError("Date must be in YYYY-MM-DD format", 400);
    }
    return value;
}
function validContent(value) {
    if (typeof value !== "string") {
        throw new commentService_1.CommentServiceError("Content must be text", 400);
    }
    const content = value.trim();
    if (content.length === 0 || Array.from(content).length > 2000) {
        throw new commentService_1.CommentServiceError("Content must contain 1 to 2000 characters", 400);
    }
    return content;
}
async function requireStudentAccess(user, studentId) {
    if (STAFF_ROLES.includes(user.role))
        return;
    if (PARENT_ROLES.includes(user.role) &&
        await parentService_1.ParentService.isStudentConnectedToParentUser(user.userId, studentId))
        return;
    throw new commentService_1.CommentServiceError("Access denied for this student", 403);
}
async function requireCommentAccess(user, commentId, editing = false) {
    const comment = await commentService_1.CommentService.getCommentAccessById(commentId);
    await requireStudentAccess(user, comment.studentId);
    if (editing && user.role !== "admin" && comment.authorId !== user.userId) {
        throw new commentService_1.CommentServiceError("Only the author or an admin can modify this comment", 403);
    }
    return comment;
}
function respondWithError(res, error, fallback) {
    if (error instanceof commentService_1.CommentServiceError) {
        res.status(error.status).json({ success: false, error: error.message, message: error.message });
        return;
    }
    console.error(fallback);
    res.status(500).json({ success: false, error: fallback });
}
class CommentController {
    static async getComments(req, res) {
        try {
            const user = requireCommentUser(req);
            const { studentId, date, authorRole, parentCommentId, page, limit } = req.query;
            const filters = {
                studentId: studentId === undefined ? undefined : positiveInteger(studentId, "student ID"),
                date: date === undefined ? undefined : validDate(date),
                authorRole: authorRole === undefined ? undefined : String(authorRole),
                parentCommentId: parentCommentId === undefined ? undefined : positiveInteger(parentCommentId, "parent comment ID"),
                page: page === undefined ? 1 : positiveInteger(page, "page"),
                limit: limit === undefined ? 50 : positiveInteger(limit, "limit"),
            };
            if (filters.limit > 100 || !Number.isSafeInteger((filters.page - 1) * filters.limit)) {
                throw new commentService_1.CommentServiceError("Invalid pagination; limit must be between 1 and 100", 400);
            }
            if (authorRole !== undefined && (typeof authorRole !== "string" || !COMMENT_ROLES.includes(authorRole))) {
                throw new commentService_1.CommentServiceError("Invalid author role", 400);
            }
            // Parent listings must identify the student before any content is fetched.
            if (PARENT_ROLES.includes(user.role) && filters.studentId === undefined) {
                throw new commentService_1.CommentServiceError("A connected student ID is required", 403);
            }
            if (filters.studentId !== undefined)
                await requireStudentAccess(user, filters.studentId);
            if (filters.parentCommentId !== undefined) {
                const parent = await requireCommentAccess(user, filters.parentCommentId);
                if (filters.studentId !== undefined && parent.studentId !== filters.studentId) {
                    throw new commentService_1.CommentServiceError("Comment does not belong to this student", 400);
                }
            }
            const { comments, total } = await commentService_1.CommentService.getComments(filters);
            const totalPages = Math.ceil(total / filters.limit);
            res.json({
                success: true,
                data: comments,
                pagination: {
                    currentPage: filters.page,
                    totalPages,
                    totalItems: total,
                    itemsPerPage: filters.limit,
                    hasNextPage: filters.page < totalPages,
                    hasPrevPage: filters.page > 1,
                },
            });
        }
        catch (error) {
            respondWithError(res, error, "Failed to fetch comments");
        }
    }
    static async getStudentComments(req, res) {
        try {
            const user = requireCommentUser(req);
            const studentId = positiveInteger(req.params.studentId, "student ID");
            const date = req.query.date === undefined ? undefined : validDate(req.query.date);
            const authorRole = req.query.authorRole;
            if (authorRole !== undefined && (typeof authorRole !== "string" || !COMMENT_ROLES.includes(authorRole))) {
                throw new commentService_1.CommentServiceError("Invalid author role", 400);
            }
            await requireStudentAccess(user, studentId);
            const comments = await commentService_1.CommentService.getStudentComments(studentId, date, authorRole);
            res.json({ success: true, data: comments });
        }
        catch (error) {
            respondWithError(res, error, "Failed to fetch student comments");
        }
    }
    static async getDailyComments(req, res) {
        try {
            const user = requireCommentUser(req);
            if (!STAFF_ROLES.includes(user.role))
                throw new commentService_1.CommentServiceError("Access denied", 403);
            const comments = await commentService_1.CommentService.getDailyComments(validDate(req.params.date));
            res.json({ success: true, data: comments });
        }
        catch (error) {
            respondWithError(res, error, "Failed to fetch daily comments");
        }
    }
    static async createComment(req, res) {
        try {
            const user = requireCommentUser(req);
            const studentId = positiveInteger(req.body?.studentId, "student ID");
            const content = validContent(req.body?.content);
            const date = validDate(req.body?.date);
            const clientMessageId = req.body?.clientMessageId;
            if (clientMessageId !== undefined && (typeof clientMessageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientMessageId)))
                throw new commentService_1.CommentServiceError('Invalid message ID', 400);
            const parentCommentId = req.body?.parentCommentId == null
                ? undefined
                : positiveInteger(req.body.parentCommentId, "parent comment ID");
            await requireStudentAccess(user, studentId);
            const isReply = parentCommentId !== undefined;
            if (parentCommentId !== undefined) {
                const parent = await requireCommentAccess(user, parentCommentId);
                if (parent.studentId !== studentId) {
                    throw new commentService_1.CommentServiceError("Reply comment does not belong to the same student", 400);
                }
                if (parent.date !== date) {
                    throw new commentService_1.CommentServiceError("Reply date must match the original comment date", 400);
                }
            }
            else if (!STAFF_ROLES.includes(user.role)) {
                throw new commentService_1.CommentServiceError("Only admin and teachers can create original comments", 403);
            }
            const authorRole = PARENT_ROLES.includes(user.role)
                ? "parent"
                : user.role;
            const comment = await commentService_1.CommentService.createComment({
                studentId,
                authorId: user.userId,
                authorRole,
                content,
                date,
                parentCommentId,
                ...(clientMessageId ? { clientMessageId } : {}),
            });
            res.status(201).json({
                success: true,
                data: comment,
                message: isReply ? "Reply added successfully" : "Comment created successfully",
            });
        }
        catch (error) {
            respondWithError(res, error, "Failed to create comment");
        }
    }
    static async updateComment(req, res) {
        try {
            const user = requireCommentUser(req);
            const id = positiveInteger(req.params.id, "comment ID");
            const content = validContent(req.body?.content);
            await requireCommentAccess(user, id, true);
            const comment = await commentService_1.CommentService.updateComment(id, { content }, user.userId, user.role === "admin");
            res.json({ success: true, data: comment, message: "Comment updated successfully" });
        }
        catch (error) {
            respondWithError(res, error, "Failed to update comment");
        }
    }
    static async deleteComment(req, res) {
        try {
            const user = requireCommentUser(req);
            const id = positiveInteger(req.params.id, "comment ID");
            await requireCommentAccess(user, id, true);
            await commentService_1.CommentService.deleteComment(id, user.userId, user.role === "admin");
            res.json({ success: true, message: "Comment deleted successfully" });
        }
        catch (error) {
            respondWithError(res, error, "Failed to delete comment");
        }
    }
    static async getCommentThread(req, res) {
        try {
            const user = requireCommentUser(req);
            const id = positiveInteger(req.params.id, "comment ID");
            const comment = await requireCommentAccess(user, id);
            const thread = await commentService_1.CommentService.getCommentThread(id, comment.studentId);
            res.json({ success: true, data: thread });
        }
        catch (error) {
            respondWithError(res, error, "Failed to fetch comment thread");
        }
    }
}
exports.CommentController = CommentController;

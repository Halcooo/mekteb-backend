"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentController = void 0;
const commentService_1 = require("../services/commentService");
const parentService_1 = require("../services/parentService");
const notificationService_1 = require("../services/notificationService");
const dateInput_1 = require("../utils/dateInput");
class CommentController {
    // Get comments with filters
    static async getComments(req, res) {
        try {
            const { studentId, date, authorRole, parentCommentId, page, limit } = req.query;
            const filters = {
                studentId: studentId ? parseInt(studentId) : undefined,
                date: (0, dateInput_1.normalizeDateOnlyInput)(date) || undefined,
                authorRole: authorRole,
                parentCommentId: parentCommentId
                    ? parseInt(parentCommentId)
                    : undefined,
                page: page ? parseInt(page) : 1,
                limit: limit ? parseInt(limit) : 50,
            };
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
            console.error("Error in getComments:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch comments",
                message: error.message,
            });
        }
    }
    // Get comments for a specific student
    static async getStudentComments(req, res) {
        try {
            const studentId = parseInt(req.params.studentId);
            const { date, authorRole } = req.query;
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (isNaN(studentId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid student ID",
                });
                return;
            }
            // For parents, ensure they can only see comments for their connected students
            if (req.user?.role === "parent") {
                const canAccess = await parentService_1.ParentService.isStudentConnectedToParentUser(req.user.userId, studentId);
                if (!canAccess) {
                    res.status(403).json({
                        success: false,
                        error: "Access denied for this student",
                    });
                    return;
                }
            }
            const comments = await commentService_1.CommentService.getStudentComments(studentId, normalizedDate || undefined, authorRole);
            res.json({
                success: true,
                data: comments,
            });
        }
        catch (error) {
            console.error("Error in getStudentComments:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch student comments",
                message: error.message,
            });
        }
    }
    // Get daily comments (admin view)
    static async getDailyComments(req, res) {
        try {
            const { date } = req.params;
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (!normalizedDate) {
                res.status(400).json({
                    success: false,
                    error: "Date must be in YYYY-MM-DD format",
                });
                return;
            }
            // Only admin and teachers can view daily comments
            if (!["admin", "teacher"].includes(req.user?.role || "")) {
                res.status(403).json({
                    success: false,
                    error: "Access denied",
                });
                return;
            }
            const comments = await commentService_1.CommentService.getDailyComments(normalizedDate);
            res.json({
                success: true,
                data: comments,
            });
        }
        catch (error) {
            console.error("Error in getDailyComments:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch daily comments",
                message: error.message,
            });
        }
    }
    // Create a new comment
    static async createComment(req, res) {
        try {
            const { studentId, content, date, parentCommentId } = req.body;
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            if (!studentId || !content || !normalizedDate) {
                res.status(400).json({
                    success: false,
                    error: "Student ID, content, and valid date are required",
                });
                return;
            }
            const parsedStudentId = parseInt(studentId, 10);
            const parsedParentCommentId = parentCommentId
                ? parseInt(parentCommentId, 10)
                : undefined;
            if (Number.isNaN(parsedStudentId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid student ID",
                });
                return;
            }
            // Determine comment type based on user role and parentCommentId
            let authorRole;
            let repliedToCommentAuthorId = null;
            let isReply = false;
            if (parsedParentCommentId) {
                isReply = true;
                // Reply is allowed for parent/admin/teacher
                if (!("parent" === req.user.role ||
                    ["admin", "teacher"].includes(req.user.role))) {
                    res.status(403).json({
                        success: false,
                        error: "Only parent, admin, or teacher can reply to comments",
                    });
                    return;
                }
                if (req.user.role === "parent") {
                    const canAccess = await parentService_1.ParentService.isStudentConnectedToParentUser(req.user.userId, parsedStudentId);
                    if (!canAccess) {
                        res.status(403).json({
                            success: false,
                            error: "Access denied for this student",
                        });
                        return;
                    }
                }
                const parentComment = await commentService_1.CommentService.getCommentById(parsedParentCommentId);
                if (parentComment.studentId !== parsedStudentId) {
                    res.status(400).json({
                        success: false,
                        error: "Reply comment does not belong to the same student",
                    });
                    return;
                }
                repliedToCommentAuthorId = parentComment.authorId;
                if (req.user.role === "parent") {
                    authorRole = "parent";
                }
                else {
                    authorRole = req.user.role;
                }
            }
            else {
                // This is an original comment - only admin/teacher can create
                if (!["admin", "teacher"].includes(req.user.role)) {
                    res.status(403).json({
                        success: false,
                        error: "Only admin and teachers can create original comments",
                    });
                    return;
                }
                authorRole = req.user.role;
            }
            const commentData = {
                studentId: parsedStudentId,
                authorId: req.user.userId,
                authorRole,
                content: content.trim(),
                date: normalizedDate,
                parentCommentId: parsedParentCommentId,
            };
            const comment = await commentService_1.CommentService.createComment(commentData);
            if (isReply && repliedToCommentAuthorId) {
                if (repliedToCommentAuthorId !== req.user.userId) {
                    const actorLabel = authorRole === "parent"
                        ? "Parent"
                        : authorRole === "admin"
                            ? "Admin"
                            : "Teacher";
                    await notificationService_1.NotificationService.createForUsers({
                        recipientUserIds: [repliedToCommentAuthorId],
                        actorUserId: req.user.userId,
                        type: "COMMENT_REPLIED",
                        title: `${actorLabel} replied`,
                        message: `${actorLabel} replied to your comment for ${comment.studentName || "student"}.`,
                        studentId: comment.studentId,
                        commentId: comment.id,
                        commentDate: comment.date,
                    });
                }
            }
            if (!isReply && (authorRole === "admin" || authorRole === "teacher")) {
                const parentUserIds = await parentService_1.ParentService.getConnectedParentUserIds(comment.studentId);
                const recipientUserIds = parentUserIds.filter((id) => id !== req.user?.userId);
                if (recipientUserIds.length > 0) {
                    await notificationService_1.NotificationService.createForUsers({
                        recipientUserIds,
                        actorUserId: req.user.userId,
                        type: "COMMENT_ADDED",
                        title: "New attendance comment",
                        message: `A new comment was added for ${comment.studentName || "your student"}.`,
                        studentId: comment.studentId,
                        commentId: comment.id,
                        commentDate: comment.date,
                    });
                }
            }
            res.status(201).json({
                success: true,
                data: comment,
                message: parsedParentCommentId
                    ? "Reply added successfully"
                    : "Comment created successfully",
            });
        }
        catch (error) {
            console.error("Error in createComment:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create comment",
                message: error.message,
            });
        }
    }
    // Update a comment
    static async updateComment(req, res) {
        try {
            const commentId = parseInt(req.params.id);
            const { content } = req.body;
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            if (isNaN(commentId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid comment ID",
                });
                return;
            }
            if (!content || content.trim().length === 0) {
                res.status(400).json({
                    success: false,
                    error: "Content is required",
                });
                return;
            }
            const updatedComment = await commentService_1.CommentService.updateComment(commentId, { content: content.trim() }, req.user.userId);
            res.json({
                success: true,
                data: updatedComment,
                message: "Comment updated successfully",
            });
        }
        catch (error) {
            console.error("Error in updateComment:", error);
            const status = error.message.includes("Unauthorized")
                ? 403
                : 500;
            res.status(status).json({
                success: false,
                error: "Failed to update comment",
                message: error.message,
            });
        }
    }
    // Delete a comment
    static async deleteComment(req, res) {
        try {
            const commentId = parseInt(req.params.id);
            if (!req.user) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            if (isNaN(commentId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid comment ID",
                });
                return;
            }
            await commentService_1.CommentService.deleteComment(commentId, req.user.userId);
            res.json({
                success: true,
                message: "Comment deleted successfully",
            });
        }
        catch (error) {
            console.error("Error in deleteComment:", error);
            const status = error.message.includes("Unauthorized")
                ? 403
                : 500;
            res.status(status).json({
                success: false,
                error: "Failed to delete comment",
                message: error.message,
            });
        }
    }
    // Get comment thread
    static async getCommentThread(req, res) {
        try {
            const parentCommentId = parseInt(req.params.id);
            if (isNaN(parentCommentId)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid comment ID",
                });
                return;
            }
            const thread = await commentService_1.CommentService.getCommentThread(parentCommentId);
            res.json({
                success: true,
                data: thread,
            });
        }
        catch (error) {
            console.error("Error in getCommentThread:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch comment thread",
                message: error.message,
            });
        }
    }
}
exports.CommentController = CommentController;

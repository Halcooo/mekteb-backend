"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const commentController_js_1 = require("../controllers/commentController.js");
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const router = (0, express_1.Router)();
// Apply authentication to all comment routes
router.use(authMiddleware_js_1.authenticateToken);
// GET /api/comments - Get comments with filters (admin/teacher/parent)
router.get("/", commentController_js_1.CommentController.getComments);
// GET /api/comments/student/:studentId - Get comments for specific student (parent access)
router.get("/student/:studentId", commentController_js_1.CommentController.getStudentComments);
// GET /api/comments/daily/:date - Get all daily comments (admin/teacher only)
router.get("/daily/:date", commentController_js_1.CommentController.getDailyComments);
// GET /api/comments/thread/:id - Get comment thread (parent comment + replies)
router.get("/thread/:id", commentController_js_1.CommentController.getCommentThread);
// POST /api/comments - Create new comment (admin/teacher) or reply (parent)
router.post("/", commentController_js_1.CommentController.createComment);
// PUT /api/comments/:id - Update comment (author only)
router.put("/:id", commentController_js_1.CommentController.updateComment);
// DELETE /api/comments/:id - Delete comment (author only)
router.delete("/:id", commentController_js_1.CommentController.deleteComment);
exports.default = router;

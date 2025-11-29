import { Router } from "express";
import { CommentController } from "../controllers/commentController";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware";

const router = Router();

// Apply authentication to all comment routes
router.use(authenticateToken);

// GET /api/comments - Get comments with filters (admin/teacher/parent)
router.get("/", CommentController.getComments);

// GET /api/comments/student/:studentId - Get comments for specific student (parent access)
router.get("/student/:studentId", CommentController.getStudentComments);

// GET /api/comments/daily/:date - Get all daily comments (admin/teacher only)
router.get("/daily/:date", CommentController.getDailyComments);

// GET /api/comments/thread/:id - Get comment thread (parent comment + replies)
router.get("/thread/:id", CommentController.getCommentThread);

// POST /api/comments - Create new comment (admin/teacher) or reply (parent)
router.post("/", CommentController.createComment);

// PUT /api/comments/:id - Update comment (author only)
router.put("/:id", CommentController.updateComment);

// DELETE /api/comments/:id - Delete comment (author only)
router.delete("/:id", CommentController.deleteComment);

export default router;

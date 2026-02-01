import { Request, Response } from "express";
import { CommentService, CreateCommentData } from "../services/commentService";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    email: string;
    role: string;
  };
}

export class CommentController {
  // Get comments with filters
  static async getComments(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { studentId, date, authorRole, parentCommentId, page, limit } =
        req.query;

      const filters = {
        studentId: studentId ? parseInt(studentId as string) : undefined,
        date: date as string,
        authorRole: authorRole as string,
        parentCommentId: parentCommentId
          ? parseInt(parentCommentId as string)
          : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 50,
      };

      const { comments, total } = await CommentService.getComments(filters);

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
    } catch (error) {
      console.error("Error in getComments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch comments",
        message: (error as Error).message,
      });
    }
  }

  // Get comments for a specific student
  static async getStudentComments(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const studentId = parseInt(req.params.studentId);
      const { date, authorRole } = req.query;

      if (isNaN(studentId)) {
        res.status(400).json({
          success: false,
          error: "Invalid student ID",
        });
        return;
      }

      // For parents, ensure they can only see comments for their connected students
      if (req.user?.role === "parent") {
        // TODO: Add validation that parent is connected to this student
        // This should check the parent-student connection table
      }

      const comments = await CommentService.getStudentComments(
        studentId,
        date as string,
        authorRole as string,
      );

      res.json({
        success: true,
        data: comments,
      });
    } catch (error) {
      console.error("Error in getStudentComments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch student comments",
        message: (error as Error).message,
      });
    }
  }

  // Get daily comments (admin view)
  static async getDailyComments(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { date } = req.params;

      if (!date) {
        res.status(400).json({
          success: false,
          error: "Date is required",
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

      const comments = await CommentService.getDailyComments(date);

      res.json({
        success: true,
        data: comments,
      });
    } catch (error) {
      console.error("Error in getDailyComments:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch daily comments",
        message: (error as Error).message,
      });
    }
  }

  // Create a new comment
  static async createComment(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { studentId, content, date, parentCommentId } = req.body;

      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      if (!studentId || !content || !date) {
        res.status(400).json({
          success: false,
          error: "Student ID, content, and date are required",
        });
        return;
      }

      // Determine comment type based on user role and parentCommentId
      let authorRole: "admin" | "teacher" | "parent";

      if (parentCommentId) {
        // This is a reply - only parents can reply
        if (req.user.role !== "parent") {
          res.status(403).json({
            success: false,
            error: "Only parents can reply to comments",
          });
          return;
        }
        authorRole = "parent";
      } else {
        // This is an original comment - only admin/teacher can create
        if (!["admin", "teacher"].includes(req.user.role)) {
          res.status(403).json({
            success: false,
            error: "Only admin and teachers can create original comments",
          });
          return;
        }
        authorRole = req.user.role as "admin" | "teacher";
      }

      const commentData: CreateCommentData = {
        studentId: parseInt(studentId),
        authorId: req.user.userId,
        authorRole,
        content: content.trim(),
        date,
        parentCommentId: parentCommentId
          ? parseInt(parentCommentId)
          : undefined,
      };

      const comment = await CommentService.createComment(commentData);

      res.status(201).json({
        success: true,
        data: comment,
        message: parentCommentId
          ? "Reply added successfully"
          : "Comment created successfully",
      });
    } catch (error) {
      console.error("Error in createComment:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create comment",
        message: (error as Error).message,
      });
    }
  }

  // Update a comment
  static async updateComment(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
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

      const updatedComment = await CommentService.updateComment(
        commentId,
        { content: content.trim() },
        req.user.userId,
      );

      res.json({
        success: true,
        data: updatedComment,
        message: "Comment updated successfully",
      });
    } catch (error) {
      console.error("Error in updateComment:", error);
      const status = (error as Error).message.includes("Unauthorized")
        ? 403
        : 500;
      res.status(status).json({
        success: false,
        error: "Failed to update comment",
        message: (error as Error).message,
      });
    }
  }

  // Delete a comment
  static async deleteComment(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
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

      await CommentService.deleteComment(commentId, req.user.userId);

      res.json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error in deleteComment:", error);
      const status = (error as Error).message.includes("Unauthorized")
        ? 403
        : 500;
      res.status(status).json({
        success: false,
        error: "Failed to delete comment",
        message: (error as Error).message,
      });
    }
  }

  // Get comment thread
  static async getCommentThread(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const parentCommentId = parseInt(req.params.id);

      if (isNaN(parentCommentId)) {
        res.status(400).json({
          success: false,
          error: "Invalid comment ID",
        });
        return;
      }

      const thread = await CommentService.getCommentThread(parentCommentId);

      res.json({
        success: true,
        data: thread,
      });
    } catch (error) {
      console.error("Error in getCommentThread:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch comment thread",
        message: (error as Error).message,
      });
    }
  }
}

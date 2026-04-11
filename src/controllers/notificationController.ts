import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { NotificationService } from "../services/notificationService";

export class NotificationController {
  static async getNotifications(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const limit = req.query.limit
        ? parseInt(req.query.limit as string, 10)
        : 30;
      const unreadOnly = req.query.unreadOnly === "true";

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const data = await NotificationService.getUserNotifications(
        userId,
        limit,
        unreadOnly,
      );

      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch notifications",
        message: (error as Error).message,
      });
    }
  }

  static async getUnreadCount(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const count = await NotificationService.getUnreadCount(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to fetch unread count",
        message: (error as Error).message,
      });
    }
  }

  static async markAsRead(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const notificationId = parseInt(req.params.id, 10);

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      if (Number.isNaN(notificationId)) {
        res.status(400).json({
          success: false,
          error: "Invalid notification ID",
        });
        return;
      }

      const updated = await NotificationService.markAsRead(
        notificationId,
        userId,
      );

      if (!updated) {
        res.status(404).json({
          success: false,
          error: "Notification not found",
        });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update notification",
        message: (error as Error).message,
      });
    }
  }

  static async markAllAsRead(
    req: AuthenticatedRequest,
    res: Response,
  ): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const updatedCount = await NotificationService.markAllAsRead(userId);
      res.json({
        success: true,
        data: { updatedCount },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update notifications",
        message: (error as Error).message,
      });
    }
  }
}

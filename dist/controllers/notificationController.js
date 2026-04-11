"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const notificationService_1 = require("../services/notificationService");
class NotificationController {
    static async getNotifications(req, res) {
        try {
            const userId = req.user?.userId;
            const limit = req.query.limit
                ? parseInt(req.query.limit, 10)
                : 30;
            const unreadOnly = req.query.unreadOnly === "true";
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const data = await notificationService_1.NotificationService.getUserNotifications(userId, limit, unreadOnly);
            res.json({ success: true, data });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch notifications",
                message: error.message,
            });
        }
    }
    static async getUnreadCount(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const count = await notificationService_1.NotificationService.getUnreadCount(userId);
            res.json({
                success: true,
                data: { count },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to fetch unread count",
                message: error.message,
            });
        }
    }
    static async markAsRead(req, res) {
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
            const updated = await notificationService_1.NotificationService.markAsRead(notificationId, userId);
            if (!updated) {
                res.status(404).json({
                    success: false,
                    error: "Notification not found",
                });
                return;
            }
            res.json({ success: true });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to update notification",
                message: error.message,
            });
        }
    }
    static async markAllAsRead(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: "Authentication required",
                });
                return;
            }
            const updatedCount = await notificationService_1.NotificationService.markAllAsRead(userId);
            res.json({
                success: true,
                data: { updatedCount },
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: "Failed to update notifications",
                message: error.message,
            });
        }
    }
}
exports.NotificationController = NotificationController;

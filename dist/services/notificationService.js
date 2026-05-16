"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
const db_1 = __importDefault(require("../db"));
const caseConverter_1 = require("../utils/caseConverter");
const notificationHub_1 = require("./notificationHub");
class NotificationService {
    static async createForUsers(input) {
        const uniqueRecipientIds = Array.from(new Set(input.recipientUserIds)).filter((id) => Number.isInteger(id) && id > 0);
        if (uniqueRecipientIds.length === 0) {
            return;
        }
        const values = uniqueRecipientIds
            .map(() => "(?, ?, ?, ?, ?, ?, ?, ?)")
            .join(",");
        const params = [];
        uniqueRecipientIds.forEach((recipientUserId) => {
            params.push(recipientUserId);
            params.push(input.actorUserId ?? null);
            params.push(input.type);
            params.push(input.title);
            params.push(input.message);
            params.push(input.studentId ?? null);
            params.push(input.commentId ?? null);
            params.push(input.commentDate ?? null);
        });
        const query = `
      INSERT INTO notifications (
        recipient_user_id,
        actor_user_id,
        type,
        title,
        message,
        student_id,
        comment_id,
        comment_date
      ) VALUES ${values}
    `;
        await db_1.default.execute(query, params);
        notificationHub_1.NotificationHub.notifyUsers(uniqueRecipientIds, "notification:new");
    }
    static async getUserNotifications(userId, limit = 30, unreadOnly = false) {
        const safeLimit = Number.isFinite(limit)
            ? Math.max(1, Math.min(100, Math.floor(limit)))
            : 30;
        let query = `
      SELECT
        n.*,
        au.username AS actor_username,
        CONCAT(s.first_name, ' ', s.last_name) AS student_name
      FROM notifications n
      LEFT JOIN users au ON au.id = n.actor_user_id
      LEFT JOIN students s ON s.id = n.student_id
      WHERE n.recipient_user_id = ?
    `;
        const params = [userId];
        if (unreadOnly) {
            query += " AND n.is_read = 0";
        }
        query += ` ORDER BY n.created_at DESC LIMIT ${safeLimit}`;
        const [rows] = await db_1.default.query(query, params);
        return rows.map((row) => (0, caseConverter_1.keysToCamelCase)(row));
    }
    static async getUnreadCount(userId) {
        const [rows] = await db_1.default.execute(`SELECT COUNT(*) as unread_count
       FROM notifications
       WHERE recipient_user_id = ? AND is_read = 0`, [userId]);
        return Number(rows[0]?.unread_count || 0);
    }
    static async markAsRead(notificationId, userId) {
        const [result] = await db_1.default.execute(`UPDATE notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND recipient_user_id = ?`, [notificationId, userId]);
        const updated = result.affectedRows > 0;
        if (updated) {
            notificationHub_1.NotificationHub.notifyUser(userId, "notification:update");
        }
        return updated;
    }
    static async markAllAsRead(userId) {
        const [result] = await db_1.default.execute(`UPDATE notifications
       SET is_read = 1, read_at = CURRENT_TIMESTAMP
       WHERE recipient_user_id = ? AND is_read = 0`, [userId]);
        if (result.affectedRows > 0) {
            notificationHub_1.NotificationHub.notifyUser(userId, "notification:update");
        }
        return result.affectedRows;
    }
}
exports.NotificationService = NotificationService;

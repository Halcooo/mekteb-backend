import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware";
import { NotificationController } from "../controllers/notificationController";

const router = Router();

router.use(authenticateToken);

router.get("/", NotificationController.getNotifications);
router.get("/unread-count", NotificationController.getUnreadCount);
router.patch("/:id/read", NotificationController.markAsRead);
router.patch("/read-all", NotificationController.markAllAsRead);

export default router;

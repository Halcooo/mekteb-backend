import express from "express";
import { ParentController } from "../controllers/parentController";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";
import { parentConnectionLimiter } from "../middleware/rateLimiters";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken, requireRole(["parent", "user", "admin"]));

// POST /api/parent/connect - Connect to student using parent key
router.post("/connect", parentConnectionLimiter, ParentController.connectToStudent);

// GET /api/parent/students - Get connected students
router.get("/students", ParentController.getConnectedStudents);

// GET /api/parent/students/:studentId/attendance - Get attendance records for connected student
router.get(
  "/students/:studentId/attendance",
  ParentController.getStudentAttendance,
);

// GET /api/parent/students/:studentId/attendance/stats - Get attendance stats for connected student
router.get(
  "/students/:studentId/attendance/stats",
  ParentController.getStudentAttendanceStats,
);

// DELETE /api/parent/students/:studentId - Disconnect from student
router.delete("/students/:studentId", ParentController.disconnectFromStudent);

export default router;

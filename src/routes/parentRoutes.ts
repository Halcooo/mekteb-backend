import express from "express";
import { ParentController } from "../controllers/parentController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// POST /api/parent/connect - Connect to student using parent key
router.post("/connect", ParentController.connectToStudent);

// GET /api/parent/students - Get connected students
router.get("/students", ParentController.getConnectedStudents);

// DELETE /api/parent/students/:studentId - Disconnect from student
router.delete("/students/:studentId", ParentController.disconnectFromStudent);

export default router;

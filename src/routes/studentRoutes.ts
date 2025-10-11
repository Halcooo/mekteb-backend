import { Router } from "express";
import { StudentController } from "../controllers/studentController.js";
import {
  authenticateToken,
  requireRole,
} from "../middleware/authMiddleware.js";

const router = Router();

// Apply authentication to all student routes
router.use(authenticateToken);

// GET /api/students - Get all students
router.get("/", StudentController.getAllStudents);

// GET /api/students/search?q=searchTerm - Search students
router.get("/search", StudentController.searchStudents);

// GET /api/students/stats - Get student statistics
router.get("/stats", StudentController.getStudentStats);

// GET /api/students/:id - Get student by ID
router.get("/:id", StudentController.getStudentById);

// GET /api/students/parent/:parentId - Get students by parent ID
router.get("/parent/:parentId", StudentController.getStudentsByParent);

// GET /api/students/grade/:grade - Get students by grade level
router.get("/grade/:grade", StudentController.getStudentsByGrade);

// POST /api/students - Create new student
router.post("/", StudentController.createStudent);

// PUT /api/students/:id - Update student by ID
router.put("/:id", StudentController.updateStudent);

// DELETE /api/students/:id - Delete student by ID
router.delete("/:id", StudentController.deleteStudent);

export default router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const studentController_js_1 = require("../controllers/studentController.js");
const authMiddleware_js_1 = require("../middleware/authMiddleware.js");
const router = (0, express_1.Router)();
// Apply authentication to all student routes
router.use(authMiddleware_js_1.authenticateToken);
// GET /api/students - Get all students
router.get("/", studentController_js_1.StudentController.getAllStudents);
// GET /api/students/search?q=searchTerm - Search students
router.get("/search", studentController_js_1.StudentController.searchStudents);
// GET /api/students/stats - Get student statistics
router.get("/stats", studentController_js_1.StudentController.getStudentStats);
// GET /api/students/:id - Get student by ID
router.get("/:id", studentController_js_1.StudentController.getStudentById);
// GET /api/students/parent/:parentId - Get students by parent ID
router.get("/parent/:parentId", studentController_js_1.StudentController.getStudentsByParent);
// GET /api/students/grade/:grade - Get students by grade level
router.get("/grade/:grade", studentController_js_1.StudentController.getStudentsByGrade);
// POST /api/students - Create new student
router.post("/", studentController_js_1.StudentController.createStudent);
// PUT /api/students/:id - Update student by ID
router.put("/:id", studentController_js_1.StudentController.updateStudent);
// DELETE /api/students/:id - Delete student by ID
router.delete("/:id", studentController_js_1.StudentController.deleteStudent);
exports.default = router;

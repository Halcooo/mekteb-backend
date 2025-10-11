import { Router } from "express";
import { AttendanceController } from "../controllers/attendanceController.js";

const router = Router();

// GET /api/attendance - Get all attendance records (optional ?date=YYYY-MM-DD)
router.get("/", AttendanceController.getAllAttendance);

// GET /api/attendance/:id - Get attendance record by ID
router.get("/:id", AttendanceController.getAttendanceById);

// GET /api/attendance/student/:studentId - Get attendance by student ID (optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
router.get("/student/:studentId", AttendanceController.getAttendanceByStudent);

// GET /api/attendance/student/:studentId/stats - Get attendance statistics for a student (optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
router.get(
  "/student/:studentId/stats",
  AttendanceController.getStudentAttendanceStats
);

// GET /api/attendance/date/:date - Get all attendance for a specific date
router.get("/date/:date", AttendanceController.getAttendanceByDate);

// GET /api/attendance/date/:date/summary - Get attendance summary by grade for a specific date
router.get("/date/:date/summary", AttendanceController.getAttendanceSummary);

// GET /api/attendance/grade/:grade - Get attendance by grade level (optional ?date=YYYY-MM-DD)
router.get("/grade/:grade", AttendanceController.getAttendanceByGrade);

// POST /api/attendance - Create new attendance record
router.post("/", AttendanceController.createAttendance);

// POST /api/attendance/bulk - Create multiple attendance records
router.post("/bulk", AttendanceController.createBulkAttendance);

// PUT /api/attendance/:id - Update attendance record by ID
router.put("/:id", AttendanceController.updateAttendance);

// DELETE /api/attendance/:id - Delete attendance record by ID
router.delete("/:id", AttendanceController.deleteAttendance);

export default router;

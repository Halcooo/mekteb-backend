"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const attendanceController_js_1 = require("../controllers/attendanceController.js");
const router = (0, express_1.Router)();
// GET /api/attendance - Get all attendance records (optional ?date=YYYY-MM-DD)
router.get("/", attendanceController_js_1.AttendanceController.getAllAttendance);
// GET /api/attendance/:id - Get attendance record by ID
router.get("/:id", attendanceController_js_1.AttendanceController.getAttendanceById);
// GET /api/attendance/student/:studentId - Get attendance by student ID (optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
router.get("/student/:studentId", attendanceController_js_1.AttendanceController.getAttendanceByStudent);
// GET /api/attendance/student/:studentId/stats - Get attendance statistics for a student (optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
router.get("/student/:studentId/stats", attendanceController_js_1.AttendanceController.getStudentAttendanceStats);
// GET /api/attendance/date/:date - Get all attendance for a specific date
router.get("/date/:date", attendanceController_js_1.AttendanceController.getAttendanceByDate);
// GET /api/attendance/date/:date/summary - Get attendance summary by grade for a specific date
router.get("/date/:date/summary", attendanceController_js_1.AttendanceController.getAttendanceSummary);
// GET /api/attendance/grade/:grade - Get attendance by grade level (optional ?date=YYYY-MM-DD)
router.get("/grade/:grade", attendanceController_js_1.AttendanceController.getAttendanceByGrade);
// POST /api/attendance - Create new attendance record
router.post("/", attendanceController_js_1.AttendanceController.createAttendance);
// POST /api/attendance/bulk - Create multiple attendance records
router.post("/bulk", attendanceController_js_1.AttendanceController.createBulkAttendance);
// PUT /api/attendance/:id - Update attendance record by ID
router.put("/:id", attendanceController_js_1.AttendanceController.updateAttendance);
// DELETE /api/attendance/:id - Delete attendance record by ID
router.delete("/:id", attendanceController_js_1.AttendanceController.deleteAttendance);
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceController = void 0;
const attendanceService_1 = require("../services/attendanceService");
class AttendanceController {
    static async getAllAttendance(req, res) {
        try {
            const { date } = req.query;
            // Validate date format if provided
            if (date && typeof date === "string") {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(date)) {
                    res.status(400).json({
                        success: false,
                        error: "Date must be in YYYY-MM-DD format",
                    });
                    return;
                }
            }
            const attendance = await attendanceService_1.AttendanceService.getAllAttendance(date);
            res.json({
                success: true,
                data: attendance,
                count: attendance.length,
                ...(date && { date }),
            });
        }
        catch (error) {
            console.error("Error in getAllAttendance controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getAttendanceById(req, res) {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid attendance ID",
                });
                return;
            }
            const attendance = await attendanceService_1.AttendanceService.getAttendanceById(id);
            if (!attendance) {
                res.status(404).json({
                    success: false,
                    error: "Attendance record not found",
                });
                return;
            }
            res.json({
                success: true,
                data: attendance,
            });
        }
        catch (error) {
            console.error("Error in getAttendanceById controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getAttendanceByStudent(req, res) {
        try {
            const student_id = parseInt(req.params.studentId);
            const { startDate, endDate } = req.query;
            if (isNaN(student_id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid student ID",
                });
                return;
            }
            // Validate date formats if provided
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (startDate &&
                typeof startDate === "string" &&
                !dateRegex.test(startDate)) {
                res.status(400).json({
                    success: false,
                    error: "Start date must be in YYYY-MM-DD format",
                });
                return;
            }
            if (endDate && typeof endDate === "string" && !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: "End date must be in YYYY-MM-DD format",
                });
                return;
            }
            const attendance = await attendanceService_1.AttendanceService.getAttendanceByStudent(student_id, startDate, endDate);
            res.json({
                success: true,
                data: attendance,
                count: attendance.length,
                student_id,
                ...(startDate && { startDate }),
                ...(endDate && { endDate }),
            });
        }
        catch (error) {
            console.error("Error in getAttendanceByStudent controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch student attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getAttendanceByDate(req, res) {
        try {
            const { date } = req.params;
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                res.status(400).json({
                    success: false,
                    error: "Date must be in YYYY-MM-DD format",
                });
                return;
            }
            const attendance = await attendanceService_1.AttendanceService.getAttendanceByDate(date);
            res.json({
                success: true,
                data: attendance,
                count: attendance.length,
                date,
            });
        }
        catch (error) {
            console.error("Error in getAttendanceByDate controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance by date",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getAttendanceByGrade(req, res) {
        try {
            const { grade } = req.params;
            const { date } = req.query;
            if (!grade) {
                res.status(400).json({
                    success: false,
                    error: "Grade level is required",
                });
                return;
            }
            // Validate date format if provided
            if (date && typeof date === "string") {
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(date)) {
                    res.status(400).json({
                        success: false,
                        error: "Date must be in YYYY-MM-DD format",
                    });
                    return;
                }
            }
            const attendance = await attendanceService_1.AttendanceService.getAttendanceByGrade(grade, date);
            res.json({
                success: true,
                data: attendance,
                count: attendance.length,
                grade,
                ...(date && { date }),
            });
        }
        catch (error) {
            console.error("Error in getAttendanceByGrade controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch attendance by grade",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async createAttendance(req, res) {
        try {
            const { student_id, date, status } = req.body;
            // Basic validation
            if (!student_id || !date || !status) {
                res.status(400).json({
                    success: false,
                    error: "student_id, date, and status are required",
                });
                return;
            }
            // Validate student_id is a number
            if (typeof student_id !== "number" || student_id <= 0) {
                res.status(400).json({
                    success: false,
                    error: "student_id must be a valid positive number",
                });
                return;
            }
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                res.status(400).json({
                    success: false,
                    error: "date must be in YYYY-MM-DD format",
                });
                return;
            }
            // Validate status
            const validStatuses = [
                "PRESENT",
                "ABSENT",
                "LATE",
                "EXCUSED",
            ];
            if (!validStatuses.includes(status)) {
                res.status(400).json({
                    success: false,
                    error: "status must be one of: PRESENT, ABSENT, LATE, EXCUSED",
                });
                return;
            }
            const newAttendance = await attendanceService_1.AttendanceService.createAttendance({
                student_id,
                date,
                status,
            });
            res.status(201).json({
                success: true,
                message: "Attendance record created successfully",
                data: newAttendance,
            });
        }
        catch (error) {
            console.error("Error in createAttendance controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async updateAttendance(req, res) {
        try {
            const id = parseInt(req.params.id);
            const { status } = req.body;
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid attendance ID",
                });
                return;
            }
            if (!status) {
                res.status(400).json({
                    success: false,
                    error: "Status is required",
                });
                return;
            }
            // Validate status
            const validStatuses = [
                "PRESENT",
                "ABSENT",
                "LATE",
                "EXCUSED",
            ];
            if (!validStatuses.includes(status)) {
                res.status(400).json({
                    success: false,
                    error: "status must be one of: PRESENT, ABSENT, LATE, EXCUSED",
                });
                return;
            }
            const updatedAttendance = await attendanceService_1.AttendanceService.updateAttendance(id, {
                status,
            });
            if (!updatedAttendance) {
                res.status(404).json({
                    success: false,
                    error: "Attendance record not found",
                });
                return;
            }
            res.json({
                success: true,
                message: "Attendance record updated successfully",
                data: updatedAttendance,
            });
        }
        catch (error) {
            console.error("Error in updateAttendance controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async deleteAttendance(req, res) {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid attendance ID",
                });
                return;
            }
            const deleted = await attendanceService_1.AttendanceService.deleteAttendance(id);
            if (!deleted) {
                res.status(404).json({
                    success: false,
                    error: "Attendance record not found",
                });
                return;
            }
            res.json({
                success: true,
                message: "Attendance record deleted successfully",
            });
        }
        catch (error) {
            console.error("Error in deleteAttendance controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getStudentAttendanceStats(req, res) {
        try {
            const student_id = parseInt(req.params.studentId);
            const { startDate, endDate } = req.query;
            if (isNaN(student_id)) {
                res.status(400).json({
                    success: false,
                    error: "Invalid student ID",
                });
                return;
            }
            // Validate date formats if provided
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (startDate &&
                typeof startDate === "string" &&
                !dateRegex.test(startDate)) {
                res.status(400).json({
                    success: false,
                    error: "Start date must be in YYYY-MM-DD format",
                });
                return;
            }
            if (endDate && typeof endDate === "string" && !dateRegex.test(endDate)) {
                res.status(400).json({
                    success: false,
                    error: "End date must be in YYYY-MM-DD format",
                });
                return;
            }
            const stats = await attendanceService_1.AttendanceService.getStudentAttendanceStats(student_id, startDate, endDate);
            res.json({
                success: true,
                data: stats,
                student_id,
                ...(startDate && { startDate }),
                ...(endDate && { endDate }),
            });
        }
        catch (error) {
            console.error("Error in getStudentAttendanceStats controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get attendance statistics",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async createBulkAttendance(req, res) {
        try {
            const { attendanceList } = req.body;
            if (!attendanceList ||
                !Array.isArray(attendanceList) ||
                attendanceList.length === 0) {
                res.status(400).json({
                    success: false,
                    error: "attendanceList must be a non-empty array",
                });
                return;
            }
            // Validate each attendance record
            const validStatuses = [
                "PRESENT",
                "ABSENT",
                "LATE",
                "EXCUSED",
            ];
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            for (let i = 0; i < attendanceList.length; i++) {
                const record = attendanceList[i];
                if (!record.student_id || !record.date || !record.status) {
                    res.status(400).json({
                        success: false,
                        error: `Record ${i + 1}: student_id, date, and status are required`,
                    });
                    return;
                }
                if (typeof record.student_id !== "number" || record.student_id <= 0) {
                    res.status(400).json({
                        success: false,
                        error: `Record ${i + 1}: student_id must be a valid positive number`,
                    });
                    return;
                }
                if (!dateRegex.test(record.date)) {
                    res.status(400).json({
                        success: false,
                        error: `Record ${i + 1}: date must be in YYYY-MM-DD format`,
                    });
                    return;
                }
                if (!validStatuses.includes(record.status)) {
                    res.status(400).json({
                        success: false,
                        error: `Record ${i + 1}: status must be one of: PRESENT, ABSENT, LATE, EXCUSED`,
                    });
                    return;
                }
            }
            const createdCount = await attendanceService_1.AttendanceService.createBulkAttendance(attendanceList);
            res.status(201).json({
                success: true,
                message: `${createdCount} attendance records created successfully`,
                createdCount,
            });
        }
        catch (error) {
            console.error("Error in createBulkAttendance controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create bulk attendance",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getAttendanceSummary(req, res) {
        try {
            const { date } = req.params;
            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(date)) {
                res.status(400).json({
                    success: false,
                    error: "Date must be in YYYY-MM-DD format",
                });
                return;
            }
            const summary = await attendanceService_1.AttendanceService.getAttendanceSummaryByDate(date);
            res.json({
                success: true,
                data: summary,
                date,
            });
        }
        catch (error) {
            console.error("Error in getAttendanceSummary controller:", error);
            res.status(500).json({
                success: false,
                error: "Failed to get attendance summary",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
}
exports.AttendanceController = AttendanceController;

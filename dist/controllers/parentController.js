"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentController = void 0;
const parentService_1 = require("../services/parentService");
const parentKeyGenerator_1 = require("../utils/parentKeyGenerator");
const requestValidation_1 = require("../utils/requestValidation");
class ParentController {
    // Connect to student using parent key
    static async connectToStudent(req, res) {
        try {
            const rawParentKey = req.body?.parentKey;
            const parentKey = typeof rawParentKey === "string" ? rawParentKey.trim().toUpperCase() : "";
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (!(0, parentKeyGenerator_1.validateParentKeyFormat)(parentKey)) {
                return res.status(400).json({
                    success: false,
                    message: "A valid parent key is required",
                });
            }
            const result = await parentService_1.ParentService.connectToStudent(userId, parentKey);
            if (!result.success) {
                return res.status(400).json(result);
            }
            res.json(result);
        }
        catch (error) {
            console.error("Error connecting to student:", error);
            res.status(500).json({
                success: false,
                message: "Failed to connect to student",
            });
        }
    }
    // Get connected students
    static async getConnectedStudents(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            const students = await parentService_1.ParentService.getConnectedStudents(userId);
            res.json({
                success: true,
                data: students,
            });
        }
        catch (error) {
            console.error("Error getting connected students:", error);
            res.status(500).json({
                success: false,
                message: "Failed to get connected students",
            });
        }
    }
    // Disconnect from student
    static async disconnectFromStudent(req, res) {
        try {
            const studentId = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (studentId === null) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid student ID",
                });
            }
            const result = await parentService_1.ParentService.disconnectFromStudent(userId, studentId);
            res.json(result);
        }
        catch (error) {
            console.error("Error disconnecting from student:", error);
            res.status(500).json({
                success: false,
                message: "Failed to disconnect from student",
            });
        }
    }
    // Get attendance records for a connected student (parent-scoped)
    static async getStudentAttendance(req, res) {
        try {
            const userId = req.user?.userId;
            const studentId = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
            const limit = req.query.limit === undefined ? 10 : (0, requestValidation_1.parsePositiveInteger)(req.query.limit);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (studentId === null) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid student ID",
                });
            }
            if (limit === null || limit > 200) {
                return res.status(400).json({ success: false, message: "Limit must be between 1 and 200" });
            }
            const records = await parentService_1.ParentService.getStudentAttendanceForParent(userId, studentId, limit);
            res.json({
                success: true,
                data: records,
            });
        }
        catch (error) {
            console.error("Error getting student attendance:", error);
            if (error instanceof Error &&
                error.message === "PARENT_STUDENT_ACCESS_DENIED") {
                return res.status(403).json({
                    success: false,
                    message: "Access denied for this student",
                });
            }
            res.status(500).json({
                success: false,
                message: "Failed to get student attendance",
            });
        }
    }
    // Get attendance stats for a connected student (parent-scoped)
    static async getStudentAttendanceStats(req, res) {
        try {
            const userId = req.user?.userId;
            const studentId = (0, requestValidation_1.parsePositiveInteger)(req.params.studentId);
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (studentId === null) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid student ID",
                });
            }
            const stats = await parentService_1.ParentService.getStudentAttendanceStatsForParent(userId, studentId);
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            console.error("Error getting student attendance stats:", error);
            if (error instanceof Error &&
                error.message === "PARENT_STUDENT_ACCESS_DENIED") {
                return res.status(403).json({
                    success: false,
                    message: "Access denied for this student",
                });
            }
            res.status(500).json({
                success: false,
                message: "Failed to get student attendance stats",
            });
        }
    }
}
exports.ParentController = ParentController;

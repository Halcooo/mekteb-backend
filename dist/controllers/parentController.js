"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentController = void 0;
const parentService_1 = require("../services/parentService");
class ParentController {
    // Connect to student using parent key
    static async connectToStudent(req, res) {
        try {
            const { parentKey } = req.body;
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (!parentKey) {
                return res.status(400).json({
                    success: false,
                    message: "Parent key is required",
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
            const { studentId } = req.params;
            const userId = req.user?.userId;
            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "User not authenticated",
                });
            }
            if (!studentId) {
                return res.status(400).json({
                    success: false,
                    message: "Student ID is required",
                });
            }
            const result = await parentService_1.ParentService.disconnectFromStudent(userId, parseInt(studentId));
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
}
exports.ParentController = ParentController;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentService = void 0;
const db_1 = __importDefault(require("../db"));
const studentService_1 = require("./studentService");
class ParentService {
    // Connect parent to student using parent key
    static async connectToStudent(userId, parentKey) {
        try {
            // Find student by parent key
            const [students] = await db_1.default.execute("SELECT * FROM students WHERE parent_key = ?", [parentKey]);
            if (students.length === 0) {
                return {
                    success: false,
                    message: "Invalid parent key. No student found with this key.",
                };
            }
            const student = students[0];
            // Check if already connected
            const [existing] = await db_1.default.execute("SELECT * FROM parent_students WHERE user_id = ? AND student_id = ?", [userId, student.id]);
            if (existing.length > 0) {
                return {
                    success: false,
                    message: "You are already connected to this student.",
                };
            }
            // Create connection
            await db_1.default.execute("INSERT INTO parent_students (user_id, student_id) VALUES (?, ?)", [userId, student.id]);
            // Get full student data
            const studentData = await studentService_1.StudentService.getStudentById(student.id);
            return {
                success: true,
                message: "Successfully connected to student!",
                student: studentData,
            };
        }
        catch (error) {
            console.error("Error connecting to student:", error);
            throw new Error("Failed to connect to student");
        }
    }
    // Get connected students for parent
    static async getConnectedStudents(userId) {
        try {
            // Get connected students with additional info
            const [students] = await db_1.default.execute(`SELECT s.*, ps.connected_at,
                COUNT(CASE WHEN a.is_present = 1 THEN 1 END) as present_days,
                COUNT(a.id) as total_days,
                CASE 
                  WHEN COUNT(a.id) > 0 
                  THEN (COUNT(CASE WHEN a.is_present = 1 THEN 1 END) / COUNT(a.id)) * 100
                  ELSE 0 
                END as attendance_rate,
                MAX(a.date) as last_attendance_date
         FROM students s
         JOIN parent_students ps ON s.id = ps.student_id
         LEFT JOIN attendance a ON s.id = a.student_id
         WHERE ps.user_id = ?
         GROUP BY s.id, ps.connected_at
         ORDER BY s.full_name`, [userId]);
            return students.map((student) => ({
                ...student,
                lastAttendanceDate: student.last_attendance_date,
                attendanceRate: Math.round(student.attendance_rate || 0),
            }));
        }
        catch (error) {
            console.error("Error getting connected students:", error);
            throw new Error("Failed to get connected students");
        }
    }
    // Disconnect from student
    static async disconnectFromStudent(userId, studentId) {
        try {
            // Remove connection
            const [result] = await db_1.default.execute("DELETE FROM parent_students WHERE user_id = ? AND student_id = ?", [userId, studentId]);
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    message: "No connection found to disconnect.",
                };
            }
            return {
                success: true,
                message: "Successfully disconnected from student.",
            };
        }
        catch (error) {
            console.error("Error disconnecting from student:", error);
            throw new Error("Failed to disconnect from student");
        }
    }
}
exports.ParentService = ParentService;

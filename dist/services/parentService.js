"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParentService = void 0;
const db_1 = __importDefault(require("../db"));
const studentService_1 = require("./studentService");
class ParentService {
    static async isStudentConnectedToParent(userId, studentId) {
        const [rows] = await db_1.default.execute("SELECT 1 FROM parent_students WHERE user_id = ? AND student_id = ? LIMIT 1", [userId, studentId]);
        return rows.length > 0;
    }
    static async isStudentConnectedToParentUser(userId, studentId) {
        return this.isStudentConnectedToParent(userId, studentId);
    }
    static async getConnectedParentUserIds(studentId) {
        const [rows] = await db_1.default.execute("SELECT user_id FROM parent_students WHERE student_id = ?", [studentId]);
        return rows.map((row) => Number(row.user_id)).filter((id) => id > 0);
    }
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
            const [students] = await db_1.default.execute(`SELECT s.id,
                s.parent_id as parentId,
                s.first_name as firstName,
                s.last_name as lastName,
                s.date_of_birth as dateOfBirth,
                s.grade_level as gradeLevel,
                s.parent_key as parentKey,
                s.created_at as createdAt,
                ps.connected_at as connectedAt,
                COUNT(CASE WHEN UPPER(TRIM(a.status)) IN ('PRESENT', 'LATE') THEN 1 END) as present_days,
                COUNT(a.id) as total_days,
                CASE 
                  WHEN COUNT(a.id) > 0 
                  THEN (COUNT(CASE WHEN UPPER(TRIM(a.status)) IN ('PRESENT', 'LATE') THEN 1 END) / COUNT(a.id)) * 100
                  ELSE 0 
                END as attendance_rate,
                MAX(a.date) as last_attendance_date
         FROM students s
         JOIN parent_students ps ON s.id = ps.student_id
         LEFT JOIN (
           SELECT x.id, x.student_id, x.date, x.status
           FROM attendance x
           INNER JOIN (
             SELECT student_id, date, MAX(id) as max_id
             FROM attendance
             GROUP BY student_id, date
           ) latest ON latest.max_id = x.id
         ) a ON s.id = a.student_id
         WHERE ps.user_id = ?
         GROUP BY s.id, s.parent_id, s.first_name, s.last_name, s.date_of_birth, s.grade_level, s.parent_key, s.created_at, ps.connected_at
         ORDER BY s.last_name, s.first_name`, [userId]);
            return students.map((student) => ({
                ...student,
                lastAttendanceDate: student.last_attendance_date,
                attendanceRate: Math.round((Number(student.attendance_rate) || 0) * 10) / 10,
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
    // Get attendance records for a connected student (parent-scoped)
    static async getStudentAttendanceForParent(userId, studentId, limit = 10) {
        try {
            const isConnected = await this.isStudentConnectedToParent(userId, studentId);
            if (!isConnected) {
                throw new Error("PARENT_STUDENT_ACCESS_DENIED");
            }
            const safeLimit = Number.isFinite(limit)
                ? Math.max(1, Math.min(200, Math.floor(limit)))
                : 10;
            const [rows] = await db_1.default.query(`SELECT a.id,
                a.student_id as studentId,
                a.date,
                a.status,
                a.created_at as createdAt,
                a.updated_at as updatedAt
         FROM attendance a
         JOIN (
           SELECT student_id, date, MAX(id) as max_id
           FROM attendance
           GROUP BY student_id, date
         ) latest ON latest.max_id = a.id
         JOIN parent_students ps ON ps.student_id = a.student_id
         WHERE ps.user_id = ? AND a.student_id = ?
         ORDER BY a.date DESC
         LIMIT ${safeLimit}`, [userId, studentId]);
            return rows;
        }
        catch (error) {
            console.error("Error getting parent-scoped student attendance:", error);
            if (error instanceof Error &&
                error.message === "PARENT_STUDENT_ACCESS_DENIED") {
                throw error;
            }
            throw new Error("Failed to get student attendance");
        }
    }
    // Get attendance stats for a connected student (parent-scoped)
    static async getStudentAttendanceStatsForParent(userId, studentId) {
        try {
            const isConnected = await this.isStudentConnectedToParent(userId, studentId);
            if (!isConnected) {
                throw new Error("PARENT_STUDENT_ACCESS_DENIED");
            }
            const [rows] = await db_1.default.execute(`SELECT
           COUNT(*) as totalDays,
           SUM(CASE WHEN UPPER(TRIM(status)) = 'PRESENT' THEN 1 ELSE 0 END) as presentDays,
           SUM(CASE WHEN UPPER(TRIM(status)) = 'ABSENT' THEN 1 ELSE 0 END) as absentDays,
           SUM(CASE WHEN UPPER(TRIM(status)) = 'LATE' THEN 1 ELSE 0 END) as lateDays,
           SUM(CASE WHEN UPPER(TRIM(status)) = 'EXCUSED' THEN 1 ELSE 0 END) as excusedDays
         FROM (
           SELECT a.status
           FROM attendance a
           INNER JOIN (
             SELECT student_id, date, MAX(id) as max_id
             FROM attendance
             WHERE student_id = ?
             GROUP BY student_id, date
           ) latest ON latest.max_id = a.id
         ) deduped_attendance`, [studentId]);
            const stats = rows[0] || {
                totalDays: 0,
                presentDays: 0,
                absentDays: 0,
                lateDays: 0,
                excusedDays: 0,
            };
            const totalDays = Number(stats.totalDays) || 0;
            const presentDays = Number(stats.presentDays) || 0;
            const lateDays = Number(stats.lateDays) || 0;
            const absentDays = Number(stats.absentDays) || 0;
            const excusedDays = Number(stats.excusedDays) || 0;
            const attendanceRate = totalDays > 0 ? ((presentDays + lateDays) / totalDays) * 100 : 0;
            return {
                totalDays,
                presentDays,
                absentDays,
                lateDays,
                excusedDays,
                attendanceRate: Math.round(attendanceRate * 10) / 10,
            };
        }
        catch (error) {
            console.error("Error getting parent-scoped student attendance stats:", error);
            if (error instanceof Error &&
                error.message === "PARENT_STUDENT_ACCESS_DENIED") {
                throw error;
            }
            throw new Error("Failed to get student attendance stats");
        }
    }
}
exports.ParentService = ParentService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AttendanceService = void 0;
const db_1 = __importDefault(require("../db"));
const dateInput_1 = require("../utils/dateInput");
class AttendanceService {
    static async getAllAttendance(date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            let query = `
        SELECT a.*, 
               s.first_name as student_first_name, 
               s.last_name as student_last_name,
               s.grade_level,
               CONCAT(u.first_name, ' ', u.last_name) as parent_name
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        LEFT JOIN users u ON s.parent_id = u.id
      `;
            const params = [];
            if (normalizedDate) {
                query += " WHERE a.date = ?";
                params.push(normalizedDate);
            }
            query +=
                " ORDER BY a.date DESC, s.grade_level, s.last_name, s.first_name";
            const [rows] = await db_1.default.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance:", error);
            throw new Error("Failed to fetch attendance from database");
        }
    }
    static async getAttendanceById(id) {
        try {
            const [rows] = await db_1.default.query(`SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level,
                CONCAT(u.first_name, ' ', u.last_name) as parent_name
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         LEFT JOIN users u ON s.parent_id = u.id
         WHERE a.id = ?`, [id]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching attendance by ID:", error);
            throw new Error("Failed to fetch attendance from database");
        }
    }
    static async getAttendanceByStudent(student_id, startDate, endDate) {
        try {
            const normalizedStartDate = (0, dateInput_1.normalizeDateOnlyInput)(startDate);
            const normalizedEndDate = (0, dateInput_1.normalizeDateOnlyInput)(endDate);
            let query = `
        SELECT a.*, 
               s.first_name as student_first_name, 
               s.last_name as student_last_name,
               s.grade_level,
               CONCAT(u.first_name, ' ', u.last_name) as parent_name
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        LEFT JOIN users u ON s.parent_id = u.id
        WHERE a.student_id = ?
      `;
            const params = [student_id];
            if (normalizedStartDate && normalizedEndDate) {
                query += " AND a.date BETWEEN ? AND ?";
                params.push(normalizedStartDate, normalizedEndDate);
            }
            else if (normalizedStartDate) {
                query += " AND a.date >= ?";
                params.push(normalizedStartDate);
            }
            else if (normalizedEndDate) {
                query += " AND a.date <= ?";
                params.push(normalizedEndDate);
            }
            query += " ORDER BY a.date DESC";
            const [rows] = await db_1.default.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by student:", error);
            throw new Error("Failed to fetch student attendance from database");
        }
    }
    static async getAttendanceByDate(date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (!normalizedDate) {
                throw new Error("Invalid date format");
            }
            const [rows] = await db_1.default.query(`SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level,
                CONCAT(u.first_name, ' ', u.last_name) as parent_name
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         LEFT JOIN users u ON s.parent_id = u.id
         WHERE a.date = ?
         ORDER BY s.grade_level, s.last_name, s.first_name`, [normalizedDate]);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by date:", error);
            throw new Error("Failed to fetch attendance by date from database");
        }
    }
    static async getAttendanceByGrade(grade_level, date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            let query = `
        SELECT a.*, 
               s.first_name as student_first_name, 
               s.last_name as student_last_name,
               s.grade_level,
               CONCAT(u.first_name, ' ', u.last_name) as parent_name
        FROM attendance a
        LEFT JOIN students s ON a.student_id = s.id
        LEFT JOIN users u ON s.parent_id = u.id
        WHERE s.grade_level = ?
      `;
            const params = [grade_level];
            if (normalizedDate) {
                query += " AND a.date = ?";
                params.push(normalizedDate);
            }
            query += " ORDER BY a.date DESC, s.last_name, s.first_name";
            const [rows] = await db_1.default.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by grade:", error);
            throw new Error("Failed to fetch attendance by grade from database");
        }
    }
    static async createAttendance(attendanceData) {
        try {
            const { student_id, status } = attendanceData;
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(attendanceData.date);
            if (!normalizedDate) {
                throw new Error("Invalid date format");
            }
            // Check if attendance already exists for this student on this date
            const existingAttendance = await AttendanceService.getStudentAttendanceByDate(student_id, normalizedDate);
            if (existingAttendance) {
                const updatedAttendance = await AttendanceService.updateAttendance(existingAttendance.id, { status });
                if (!updatedAttendance) {
                    throw new Error("Failed to update existing attendance");
                }
                return updatedAttendance;
            }
            const [result] = await db_1.default.query("INSERT INTO attendance (student_id, date, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())", [student_id, normalizedDate, status]);
            const insertResult = result;
            const newAttendance = await AttendanceService.getAttendanceById(insertResult.insertId);
            if (!newAttendance) {
                throw new Error("Failed to retrieve created attendance");
            }
            return newAttendance;
        }
        catch (error) {
            console.error("Error creating attendance:", error);
            if (error.code === "ER_NO_REFERENCED_ROW_2") {
                throw new Error("Student ID does not exist");
            }
            throw error instanceof Error
                ? error
                : new Error("Failed to create attendance");
        }
    }
    static async updateAttendance(id, attendanceData) {
        try {
            const { status } = attendanceData;
            const [result] = await db_1.default.query("UPDATE attendance SET status = ?, updated_at = NOW() WHERE id = ?", [status, id]);
            const updateResult = result;
            if (updateResult.affectedRows === 0) {
                return null;
            }
            return await AttendanceService.getAttendanceById(id);
        }
        catch (error) {
            console.error("Error updating attendance:", error);
            throw new Error("Failed to update attendance");
        }
    }
    static async deleteAttendance(id) {
        try {
            const [result] = await db_1.default.query("DELETE FROM attendance WHERE id = ?", [
                id,
            ]);
            const deleteResult = result;
            return deleteResult.affectedRows > 0;
        }
        catch (error) {
            console.error("Error deleting attendance:", error);
            throw new Error("Failed to delete attendance");
        }
    }
    static async getStudentAttendanceByDate(student_id, date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (!normalizedDate) {
                throw new Error("Invalid date format");
            }
            const [rows] = await db_1.default.query(`SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         WHERE a.student_id = ? AND a.date = ?
         ORDER BY a.updated_at DESC, a.id DESC
         LIMIT 1`, [student_id, normalizedDate]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching student attendance by date:", error);
            throw new Error("Failed to fetch student attendance by date");
        }
    }
    static async getStudentAttendanceStats(student_id, startDate, endDate) {
        try {
            const normalizedStartDate = (0, dateInput_1.normalizeDateOnlyInput)(startDate);
            const normalizedEndDate = (0, dateInput_1.normalizeDateOnlyInput)(endDate);
            let query = `
        SELECT 
          COUNT(*) as totalDays,
          SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) as presentDays,
          SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) as absentDays,
          SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) as lateDays,
          SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END) as excusedDays
        FROM attendance 
        WHERE student_id = ?
      `;
            const params = [student_id];
            if (normalizedStartDate && normalizedEndDate) {
                query += " AND date BETWEEN ? AND ?";
                params.push(normalizedStartDate, normalizedEndDate);
            }
            else if (normalizedStartDate) {
                query += " AND date >= ?";
                params.push(normalizedStartDate);
            }
            else if (normalizedEndDate) {
                query += " AND date <= ?";
                params.push(normalizedEndDate);
            }
            const [rows] = await db_1.default.query(query, params);
            const stats = rows[0];
            const attendanceRate = stats.totalDays > 0
                ? ((stats.presentDays + stats.lateDays) / stats.totalDays) * 100
                : 0;
            return {
                totalDays: parseInt(stats.totalDays),
                presentDays: parseInt(stats.presentDays),
                absentDays: parseInt(stats.absentDays),
                lateDays: parseInt(stats.lateDays),
                excusedDays: parseInt(stats.excusedDays),
                attendanceRate: Math.round(attendanceRate * 100) / 100,
            };
        }
        catch (error) {
            console.error("Error getting student attendance stats:", error);
            throw new Error("Failed to get attendance statistics");
        }
    }
    static async createBulkAttendance(attendanceList) {
        try {
            if (attendanceList.length === 0) {
                return 0;
            }
            let affectedRows = 0;
            for (const attendance of attendanceList) {
                const existing = await AttendanceService.getStudentAttendanceByDate(attendance.student_id, attendance.date);
                if (existing) {
                    await AttendanceService.updateAttendance(existing.id, {
                        status: attendance.status,
                    });
                    affectedRows += 1;
                }
                else {
                    await AttendanceService.createAttendance(attendance);
                    affectedRows += 1;
                }
            }
            return affectedRows;
        }
        catch (error) {
            console.error("Error creating bulk attendance:", error);
            throw new Error("Failed to create bulk attendance");
        }
    }
    static async getAttendanceSummaryByDate(date) {
        try {
            const normalizedDate = (0, dateInput_1.normalizeDateOnlyInput)(date);
            if (!normalizedDate) {
                throw new Error("Invalid date format");
            }
            // First, get total student count and status counts
            const [totalResult] = await db_1.default.query(`SELECT COUNT(*) as total FROM students`);
            const totalStudents = Number(totalResult[0].total) || 0;
            const [statusResult] = await db_1.default.query(`SELECT 
          COALESCE(SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END), 0) as presentCount,
          COALESCE(SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END), 0) as absentCount,
          COALESCE(SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END), 0) as lateCount,
          COALESCE(SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END), 0) as excusedCount
         FROM attendance 
         WHERE date = ?`, [normalizedDate]);
            const presentCount = Number(statusResult[0]?.presentCount) || 0;
            const lateCount = Number(statusResult[0]?.lateCount) || 0;
            const excusedCount = Number(statusResult[0]?.excusedCount) || 0;
            const explicitAbsent = Number(statusResult[0]?.absentCount) || 0;
            // Calculate total absent: students without records + explicitly marked absent
            const absentCount = totalStudents - presentCount - lateCount - excusedCount;
            // Get breakdown by grade
            const [rows] = await db_1.default.query(`SELECT 
          COALESCE(s.grade_level, 'Unknown') as grade_level,
          COUNT(s.id) as totalStudents,
          COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0) as presentCount,
          COALESCE(SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END), 0) as lateCount,
          COALESCE(SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END), 0) as excusedCount
         FROM students s
         LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
         GROUP BY s.grade_level
         ORDER BY s.grade_level`, [normalizedDate]);
            const byGrade = rows.map((row) => ({
                ...row,
                absentCount: Number(row.totalStudents) -
                    Number(row.presentCount) -
                    Number(row.lateCount) -
                    Number(row.excusedCount),
            }));
            const presentRate = totalStudents
                ? (presentCount / totalStudents) * 100
                : 0;
            return {
                totals: {
                    totalStudents,
                    presentCount,
                    absentCount,
                    lateCount,
                    excusedCount,
                    presentRate: Math.round(presentRate * 10) / 10,
                },
                byGrade,
            };
        }
        catch (error) {
            console.error("Error getting attendance summary:", error);
            throw new Error("Failed to get attendance summary");
        }
    }
}
exports.AttendanceService = AttendanceService;

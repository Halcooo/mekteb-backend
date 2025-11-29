import pool from "../db.js";
export class AttendanceService {
    static async getAllAttendance(date) {
        try {
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
            if (date) {
                query += " WHERE a.date = ?";
                params.push(date);
            }
            query +=
                " ORDER BY a.date DESC, s.grade_level, s.last_name, s.first_name";
            const [rows] = await pool.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance:", error);
            throw new Error("Failed to fetch attendance from database");
        }
    }
    static async getAttendanceById(id) {
        try {
            const [rows] = await pool.query(`SELECT a.*, 
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
            if (startDate && endDate) {
                query += " AND a.date BETWEEN ? AND ?";
                params.push(startDate, endDate);
            }
            else if (startDate) {
                query += " AND a.date >= ?";
                params.push(startDate);
            }
            else if (endDate) {
                query += " AND a.date <= ?";
                params.push(endDate);
            }
            query += " ORDER BY a.date DESC";
            const [rows] = await pool.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by student:", error);
            throw new Error("Failed to fetch student attendance from database");
        }
    }
    static async getAttendanceByDate(date) {
        try {
            const [rows] = await pool.query(`SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level,
                CONCAT(u.first_name, ' ', u.last_name) as parent_name
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         LEFT JOIN users u ON s.parent_id = u.id
         WHERE a.date = ?
         ORDER BY s.grade_level, s.last_name, s.first_name`, [date]);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by date:", error);
            throw new Error("Failed to fetch attendance by date from database");
        }
    }
    static async getAttendanceByGrade(grade_level, date) {
        try {
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
            if (date) {
                query += " AND a.date = ?";
                params.push(date);
            }
            query += " ORDER BY a.date DESC, s.last_name, s.first_name";
            const [rows] = await pool.query(query, params);
            return rows;
        }
        catch (error) {
            console.error("Error fetching attendance by grade:", error);
            throw new Error("Failed to fetch attendance by grade from database");
        }
    }
    static async createAttendance(attendanceData) {
        try {
            const { student_id, date, status } = attendanceData;
            // Check if attendance already exists for this student on this date
            const existingAttendance = await AttendanceService.getStudentAttendanceByDate(student_id, date);
            if (existingAttendance) {
                throw new Error("Attendance already exists for this student on this date");
            }
            const [result] = await pool.query("INSERT INTO attendance (student_id, date, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())", [student_id, date, status]);
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
            const [result] = await pool.query("UPDATE attendance SET status = ?, updated_at = NOW() WHERE id = ?", [status, id]);
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
            const [result] = await pool.query("DELETE FROM attendance WHERE id = ?", [
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
            const [rows] = await pool.query(`SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         WHERE a.student_id = ? AND a.date = ?`, [student_id, date]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching student attendance by date:", error);
            throw new Error("Failed to fetch student attendance by date");
        }
    }
    static async getStudentAttendanceStats(student_id, startDate, endDate) {
        try {
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
            if (startDate && endDate) {
                query += " AND date BETWEEN ? AND ?";
                params.push(startDate, endDate);
            }
            else if (startDate) {
                query += " AND date >= ?";
                params.push(startDate);
            }
            else if (endDate) {
                query += " AND date <= ?";
                params.push(endDate);
            }
            const [rows] = await pool.query(query, params);
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
            const values = attendanceList.map((attendance) => [
                attendance.student_id,
                attendance.date,
                attendance.status,
            ]);
            const [result] = await pool.query("INSERT INTO attendance (student_id, date, status, created_at, updated_at) VALUES ?", [values.map((v) => [...v, new Date(), new Date()])]);
            const insertResult = result;
            return insertResult.affectedRows;
        }
        catch (error) {
            console.error("Error creating bulk attendance:", error);
            if (error.code === "ER_DUP_ENTRY") {
                throw new Error("Some attendance records already exist for the given date");
            }
            throw new Error("Failed to create bulk attendance");
        }
    }
    static async getAttendanceSummaryByDate(date) {
        try {
            const [rows] = await pool.query(`SELECT 
          s.grade_level,
          COUNT(*) as totalStudents,
          SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END) as presentCount,
          SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) as absentCount,
          SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) as lateCount,
          SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END) as excusedCount
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         WHERE a.date = ?
         GROUP BY s.grade_level
         ORDER BY s.grade_level`, [date]);
            return rows;
        }
        catch (error) {
            console.error("Error getting attendance summary:", error);
            throw new Error("Failed to get attendance summary");
        }
    }
}

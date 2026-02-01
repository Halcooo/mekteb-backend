import pool from "../db";
import { RowDataPacket } from "mysql2";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface Attendance extends RowDataPacket {
  id: number;
  student_id: number;
  date: Date;
  status: AttendanceStatus;
  created_at?: Date;
  updated_at?: Date;
  // Join fields from students and users tables
  student_first_name?: string;
  student_last_name?: string;
  grade_level?: string;
  parent_name?: string;
}

export interface CreateAttendanceData {
  student_id: number;
  date: string; // YYYY-MM-DD format
  status: AttendanceStatus;
}

export interface UpdateAttendanceData {
  status: AttendanceStatus;
}

export interface AttendanceStats {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  attendanceRate: number;
}

export class AttendanceService {
  static async getAllAttendance(date?: string): Promise<Attendance[]> {
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

      const params: any[] = [];

      if (date) {
        query += " WHERE a.date = ?";
        params.push(date);
      }

      query +=
        " ORDER BY a.date DESC, s.grade_level, s.last_name, s.first_name";

      const [rows] = await pool.query<Attendance[]>(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching attendance:", error);
      throw new Error("Failed to fetch attendance from database");
    }
  }

  static async getAttendanceById(id: number): Promise<Attendance | null> {
    try {
      const [rows] = await pool.query<Attendance[]>(
        `SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level,
                CONCAT(u.first_name, ' ', u.last_name) as parent_name
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         LEFT JOIN users u ON s.parent_id = u.id
         WHERE a.id = ?`,
        [id],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error fetching attendance by ID:", error);
      throw new Error("Failed to fetch attendance from database");
    }
  }

  static async getAttendanceByStudent(
    student_id: number,
    startDate?: string,
    endDate?: string,
  ): Promise<Attendance[]> {
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

      const params: any[] = [student_id];

      if (startDate && endDate) {
        query += " AND a.date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += " AND a.date >= ?";
        params.push(startDate);
      } else if (endDate) {
        query += " AND a.date <= ?";
        params.push(endDate);
      }

      query += " ORDER BY a.date DESC";

      const [rows] = await pool.query<Attendance[]>(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching attendance by student:", error);
      throw new Error("Failed to fetch student attendance from database");
    }
  }

  static async getAttendanceByDate(date: string): Promise<Attendance[]> {
    try {
      const [rows] = await pool.query<Attendance[]>(
        `SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level,
                CONCAT(u.first_name, ' ', u.last_name) as parent_name
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         LEFT JOIN users u ON s.parent_id = u.id
         WHERE a.date = ?
         ORDER BY s.grade_level, s.last_name, s.first_name`,
        [date],
      );
      return rows;
    } catch (error) {
      console.error("Error fetching attendance by date:", error);
      throw new Error("Failed to fetch attendance by date from database");
    }
  }

  static async getAttendanceByGrade(
    grade_level: string,
    date?: string,
  ): Promise<Attendance[]> {
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

      const params: any[] = [grade_level];

      if (date) {
        query += " AND a.date = ?";
        params.push(date);
      }

      query += " ORDER BY a.date DESC, s.last_name, s.first_name";

      const [rows] = await pool.query<Attendance[]>(query, params);
      return rows;
    } catch (error) {
      console.error("Error fetching attendance by grade:", error);
      throw new Error("Failed to fetch attendance by grade from database");
    }
  }

  static async createAttendance(
    attendanceData: CreateAttendanceData,
  ): Promise<Attendance> {
    try {
      const { student_id, date, status } = attendanceData;

      // Check if attendance already exists for this student on this date
      const existingAttendance =
        await AttendanceService.getStudentAttendanceByDate(student_id, date);
      if (existingAttendance) {
        throw new Error(
          "Attendance already exists for this student on this date",
        );
      }

      const [result] = await pool.query(
        "INSERT INTO attendance (student_id, date, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [student_id, date, status],
      );

      const insertResult = result as any;
      const newAttendance = await AttendanceService.getAttendanceById(
        insertResult.insertId,
      );

      if (!newAttendance) {
        throw new Error("Failed to retrieve created attendance");
      }

      return newAttendance;
    } catch (error) {
      console.error("Error creating attendance:", error);
      if ((error as any).code === "ER_NO_REFERENCED_ROW_2") {
        throw new Error("Student ID does not exist");
      }
      throw error instanceof Error
        ? error
        : new Error("Failed to create attendance");
    }
  }

  static async updateAttendance(
    id: number,
    attendanceData: UpdateAttendanceData,
  ): Promise<Attendance | null> {
    try {
      const { status } = attendanceData;

      const [result] = await pool.query(
        "UPDATE attendance SET status = ?, updated_at = NOW() WHERE id = ?",
        [status, id],
      );

      const updateResult = result as any;
      if (updateResult.affectedRows === 0) {
        return null;
      }

      return await AttendanceService.getAttendanceById(id);
    } catch (error) {
      console.error("Error updating attendance:", error);
      throw new Error("Failed to update attendance");
    }
  }

  static async deleteAttendance(id: number): Promise<boolean> {
    try {
      const [result] = await pool.query("DELETE FROM attendance WHERE id = ?", [
        id,
      ]);
      const deleteResult = result as any;
      return deleteResult.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting attendance:", error);
      throw new Error("Failed to delete attendance");
    }
  }

  static async getStudentAttendanceByDate(
    student_id: number,
    date: string,
  ): Promise<Attendance | null> {
    try {
      const [rows] = await pool.query<Attendance[]>(
        `SELECT a.*, 
                s.first_name as student_first_name, 
                s.last_name as student_last_name,
                s.grade_level
         FROM attendance a
         LEFT JOIN students s ON a.student_id = s.id
         WHERE a.student_id = ? AND a.date = ?`,
        [student_id, date],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error fetching student attendance by date:", error);
      throw new Error("Failed to fetch student attendance by date");
    }
  }

  static async getStudentAttendanceStats(
    student_id: number,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceStats> {
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

      const params: any[] = [student_id];

      if (startDate && endDate) {
        query += " AND date BETWEEN ? AND ?";
        params.push(startDate, endDate);
      } else if (startDate) {
        query += " AND date >= ?";
        params.push(startDate);
      } else if (endDate) {
        query += " AND date <= ?";
        params.push(endDate);
      }

      const [rows] = await pool.query(query, params);
      const stats = (rows as any)[0];

      const attendanceRate =
        stats.totalDays > 0
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
    } catch (error) {
      console.error("Error getting student attendance stats:", error);
      throw new Error("Failed to get attendance statistics");
    }
  }

  static async createBulkAttendance(
    attendanceList: CreateAttendanceData[],
  ): Promise<number> {
    try {
      if (attendanceList.length === 0) {
        return 0;
      }

      const values = attendanceList.map((attendance) => [
        attendance.student_id,
        attendance.date,
        attendance.status,
      ]);

      const [result] = await pool.query(
        "INSERT INTO attendance (student_id, date, status, created_at, updated_at) VALUES ?",
        [values.map((v) => [...v, new Date(), new Date()])],
      );

      const insertResult = result as any;
      return insertResult.affectedRows;
    } catch (error) {
      console.error("Error creating bulk attendance:", error);
      if ((error as any).code === "ER_DUP_ENTRY") {
        throw new Error(
          "Some attendance records already exist for the given date",
        );
      }
      throw new Error("Failed to create bulk attendance");
    }
  }

  static async getAttendanceSummaryByDate(date: string): Promise<{
    totals: {
      totalStudents: number;
      presentCount: number;
      absentCount: number;
      lateCount: number;
      excusedCount: number;
      presentRate: number;
    };
    byGrade: any[];
  }> {
    try {
      // First, get total student count and status counts
      const [totalResult] = await pool.query<any[]>(
        `SELECT COUNT(*) as total FROM students`,
      );
      const totalStudents = Number(totalResult[0].total) || 0;

      const [statusResult] = await pool.query<any[]>(
        `SELECT 
          COALESCE(SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END), 0) as presentCount,
          COALESCE(SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END), 0) as absentCount,
          COALESCE(SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END), 0) as lateCount,
          COALESCE(SUM(CASE WHEN status = 'EXCUSED' THEN 1 ELSE 0 END), 0) as excusedCount
         FROM attendance 
         WHERE date = ?`,
        [date],
      );

      const presentCount = Number(statusResult[0]?.presentCount) || 0;
      const lateCount = Number(statusResult[0]?.lateCount) || 0;
      const excusedCount = Number(statusResult[0]?.excusedCount) || 0;
      const explicitAbsent = Number(statusResult[0]?.absentCount) || 0;

      // Calculate total absent: students without records + explicitly marked absent
      const absentCount =
        totalStudents - presentCount - lateCount - excusedCount;

      // Get breakdown by grade
      const [rows] = await pool.query(
        `SELECT 
          COALESCE(s.grade_level, 'Unknown') as grade_level,
          COUNT(s.id) as totalStudents,
          COALESCE(SUM(CASE WHEN a.status = 'PRESENT' THEN 1 ELSE 0 END), 0) as presentCount,
          COALESCE(SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END), 0) as lateCount,
          COALESCE(SUM(CASE WHEN a.status = 'EXCUSED' THEN 1 ELSE 0 END), 0) as excusedCount
         FROM students s
         LEFT JOIN attendance a ON a.student_id = s.id AND a.date = ?
         GROUP BY s.grade_level
         ORDER BY s.grade_level`,
        [date],
      );

      const byGrade = (rows as any[]).map((row) => ({
        ...row,
        absentCount:
          Number(row.totalStudents) -
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
    } catch (error) {
      console.error("Error getting attendance summary:", error);
      throw new Error("Failed to get attendance summary");
    }
  }
}

import pool from "../db";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import { StudentService } from "./studentService";

export interface ParentStudent {
  id: number;
  userId: number;
  studentId: number;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConnectStudentResult {
  success: boolean;
  message: string;
  student?: any;
}

export class ParentService {
  // Connect parent to student using parent key
  static async connectToStudent(
    userId: number,
    parentKey: string
  ): Promise<ConnectStudentResult> {
    try {
      // Find student by parent key
      const [students] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM students WHERE parent_key = ?",
        [parentKey]
      );

      if (students.length === 0) {
        return {
          success: false,
          message: "Invalid parent key. No student found with this key.",
        };
      }

      const student = students[0];

      // Check if already connected
      const [existing] = await pool.execute<RowDataPacket[]>(
        "SELECT * FROM parent_students WHERE user_id = ? AND student_id = ?",
        [userId, student.id]
      );

      if (existing.length > 0) {
        return {
          success: false,
          message: "You are already connected to this student.",
        };
      }

      // Create connection
      await pool.execute<ResultSetHeader>(
        "INSERT INTO parent_students (user_id, student_id) VALUES (?, ?)",
        [userId, student.id]
      );

      // Get full student data
      const studentData = await StudentService.getStudentById(student.id);

      return {
        success: true,
        message: "Successfully connected to student!",
        student: studentData,
      };
    } catch (error) {
      console.error("Error connecting to student:", error);
      throw new Error("Failed to connect to student");
    }
  }

  // Get connected students for parent
  static async getConnectedStudents(userId: number): Promise<any[]> {
    try {
      // Get connected students with additional info
      const [students] = await pool.execute<RowDataPacket[]>(
        `SELECT s.*, ps.connected_at,
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
         ORDER BY s.full_name`,
        [userId]
      );

      return students.map((student: any) => ({
        ...student,
        lastAttendanceDate: student.last_attendance_date,
        attendanceRate: Math.round(student.attendance_rate || 0),
      }));
    } catch (error) {
      console.error("Error getting connected students:", error);
      throw new Error("Failed to get connected students");
    }
  }

  // Disconnect from student
  static async disconnectFromStudent(
    userId: number,
    studentId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Remove connection
      const [result] = await pool.execute<ResultSetHeader>(
        "DELETE FROM parent_students WHERE user_id = ? AND student_id = ?",
        [userId, studentId]
      );

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
    } catch (error) {
      console.error("Error disconnecting from student:", error);
      throw new Error("Failed to disconnect from student");
    }
  }
}

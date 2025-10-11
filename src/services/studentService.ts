import pool from "../db.js";
import { RowDataPacket } from "mysql2";

// Database interface (using underscore_case for DB columns)
export interface StudentDB extends RowDataPacket {
  id: number;
  parent_id: number | null;
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  grade_level: string;
  created_at?: Date;
}

// API interface (using camelCase for requests/responses)
export interface Student {
  id: number;
  parentId: number | null;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gradeLevel: string;
  createdAt?: Date;
}

export interface CreateStudentData {
  parentId?: number | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string; // Will be converted to Date in database
  gradeLevel: string;
}

export interface UpdateStudentData {
  parentId?: number | null;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  gradeLevel?: string;
}

export interface PaginatedStudentsResult {
  students: Student[];
  totalCount: number;
  totalPages: number;
}

export class StudentService {
  // Helper function to convert DB format to API format
  private static mapDbToApi(dbStudent: StudentDB): Student {
    return {
      id: dbStudent.id,
      parentId: dbStudent.parent_id,
      firstName: dbStudent.first_name,
      lastName: dbStudent.last_name,
      dateOfBirth: dbStudent.date_of_birth,
      gradeLevel: dbStudent.grade_level,
      createdAt: dbStudent.created_at,
    };
  }

  static async getAllStudents(
    page: number = 1,
    limit: number = 10,
    search: string = ""
  ): Promise<PaginatedStudentsResult> {
    try {
      const offset = (page - 1) * limit;

      // Build the WHERE clause for search
      let whereClause = "";
      let queryParams: any[] = [];

      if (search.trim()) {
        whereClause = `WHERE (
          s.first_name LIKE ? OR 
          s.last_name LIKE ? OR 
          s.grade_level LIKE ? OR 
          CONCAT(s.first_name, ' ', s.last_name) LIKE ?
        )`;
        const searchPattern = `%${search.trim()}%`;
        queryParams = [
          searchPattern,
          searchPattern,
          searchPattern,
          searchPattern,
        ];
      }

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total 
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         ${whereClause}`;

      console.log("Count Query:", countQuery);
      console.log("Count Query Params:", queryParams);

      const [countRows] = await pool.query<any[]>(countQuery, queryParams);
      const totalCount = countRows[0].total;
      const totalPages = Math.ceil(totalCount / limit);

      // Get paginated results
      const selectQuery = `SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         ${whereClause}
         ORDER BY s.grade_level, s.last_name, s.first_name
         LIMIT ? OFFSET ?`;

      const selectParams = [...queryParams, limit, offset];
      console.log("Select Query:", selectQuery);
      console.log("Select Query Params:", selectParams);

      const [rows] = await pool.query<StudentDB[]>(selectQuery, selectParams);

      return {
        students: rows.map((row) => StudentService.mapDbToApi(row)),
        totalCount,
        totalPages,
      };
    } catch (error) {
      console.error("Error fetching all students:", error);
      throw new Error("Failed to fetch students from database");
    }
  }

  static async getStudentById(id: number): Promise<Student | null> {
    try {
      const [rows] = await pool.query<StudentDB[]>(
        `SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.id = ?`,
        [id]
      );
      return rows[0] ? StudentService.mapDbToApi(rows[0]) : null;
    } catch (error) {
      console.error("Error fetching student by ID:", error);
      throw new Error("Failed to fetch student from database");
    }
  }

  static async getStudentsByParent(parent_id: number): Promise<Student[]> {
    try {
      const [rows] = await pool.query<StudentDB[]>(
        `SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.parent_id = ? 
         ORDER BY s.grade_level, s.last_name, s.first_name`,
        [parent_id]
      );
      return rows.map((row) => StudentService.mapDbToApi(row));
    } catch (error) {
      console.error("Error fetching students by parent:", error);
      throw new Error("Failed to fetch students by parent from database");
    }
  }

  static async getStudentsByGrade(grade_level: string): Promise<Student[]> {
    try {
      const [rows] = await pool.query<StudentDB[]>(
        `SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.grade_level = ? 
         ORDER BY s.last_name, s.first_name`,
        [grade_level]
      );
      return rows.map((row) => StudentService.mapDbToApi(row));
    } catch (error) {
      console.error("Error fetching students by grade:", error);
      throw new Error("Failed to fetch students by grade from database");
    }
  }

  static async createStudent(studentData: CreateStudentData): Promise<Student> {
    try {
      // Convert camelCase to underscore_case for database
      const { parentId, firstName, lastName, dateOfBirth, gradeLevel } =
        studentData;

      const [result] = await pool.query(
        "INSERT INTO students (parent_id, first_name, last_name, date_of_birth, grade_level, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
        [parentId || null, firstName, lastName, dateOfBirth, gradeLevel]
      );

      const insertResult = result as any;
      const newStudent = await StudentService.getStudentById(
        insertResult.insertId
      );

      if (!newStudent) {
        throw new Error("Failed to retrieve created student");
      }

      return newStudent;
    } catch (error) {
      console.error("Error creating student:", error);
      if ((error as any).code === "ER_NO_REFERENCED_ROW_2") {
        throw new Error("Parent ID does not exist");
      }
      throw new Error("Failed to create student");
    }
  }

  static async updateStudent(
    id: number,
    studentData: UpdateStudentData
  ): Promise<Student | null> {
    try {
      // Convert camelCase to underscore_case for database
      const { parentId, firstName, lastName, dateOfBirth, gradeLevel } =
        studentData;

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (parentId !== undefined) {
        updateFields.push("parent_id = ?");
        updateValues.push(parentId);
      }

      if (firstName !== undefined) {
        updateFields.push("first_name = ?");
        updateValues.push(firstName);
      }

      if (lastName !== undefined) {
        updateFields.push("last_name = ?");
        updateValues.push(lastName);
      }

      if (dateOfBirth !== undefined) {
        updateFields.push("date_of_birth = ?");
        updateValues.push(dateOfBirth);
      }

      if (gradeLevel !== undefined) {
        updateFields.push("grade_level = ?");
        updateValues.push(gradeLevel);
      }

      if (updateFields.length === 0) {
        throw new Error("No fields to update");
      }

      updateValues.push(id);

      const [result] = await pool.query(
        `UPDATE students SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );

      const updateResult = result as any;
      if (updateResult.affectedRows === 0) {
        return null;
      }

      return await StudentService.getStudentById(id);
    } catch (error) {
      console.error("Error updating student:", error);
      if ((error as any).code === "ER_NO_REFERENCED_ROW_2") {
        throw new Error("Parent ID does not exist");
      }
      throw new Error("Failed to update student");
    }
  }

  static async deleteStudent(id: number): Promise<boolean> {
    try {
      const [result] = await pool.query("DELETE FROM students WHERE id = ?", [
        id,
      ]);
      const deleteResult = result as any;
      return deleteResult.affectedRows > 0;
    } catch (error) {
      console.error("Error deleting student:", error);
      throw new Error("Failed to delete student");
    }
  }

  static async searchStudents(searchTerm: string): Promise<Student[]> {
    try {
      const searchPattern = `%${searchTerm}%`;
      const [rows] = await pool.query<StudentDB[]>(
        `SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.first_name LIKE ? 
         OR s.last_name LIKE ? 
         OR s.grade_level LIKE ?
         OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?
         ORDER BY s.last_name, s.first_name`,
        [searchPattern, searchPattern, searchPattern, searchPattern]
      );
      return rows.map((row) => StudentService.mapDbToApi(row));
    } catch (error) {
      console.error("Error searching students:", error);
      throw new Error("Failed to search students");
    }
  }

  static async getStudentStats(): Promise<any> {
    try {
      const [gradeStats] = await pool.query(
        `SELECT grade_level, COUNT(*) as count 
         FROM students 
         GROUP BY grade_level 
         ORDER BY grade_level`
      );

      const [totalCount] = await pool.query(
        "SELECT COUNT(*) as total FROM students"
      );

      return {
        totalStudents: (totalCount as any)[0].total,
        byGrade: gradeStats,
      };
    } catch (error) {
      console.error("Error getting student statistics:", error);
      throw new Error("Failed to get student statistics");
    }
  }
}

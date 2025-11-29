"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentService = void 0;
const db_1 = __importDefault(require("../db"));
const parentKeyGenerator_1 = require("../utils/parentKeyGenerator");
/**
 * StudentService - Handles all student CRUD operations and related business logic
 *
 * Features:
 * - Student creation with automatic unique parent key generation
 * - Pagination support with search filtering
 * - Parent key validation and lookup
 * - Database to API format conversion with camelCase/snake_case handling
 */
class StudentService {
    /**
     * Checks if a parent key already exists in the database
     * @param parentKey - The parent key string to validate
     * @returns Promise<boolean> - True if key exists, false otherwise (defaults to true on error for safety)
     * @private
     */
    static async parentKeyExists(parentKey) {
        try {
            const [rows] = await db_1.default.query("SELECT COUNT(*) as count FROM students WHERE parent_key = ?", [parentKey]);
            return rows[0].count > 0;
        }
        catch (error) {
            console.error("Error checking parent key existence:", error);
            return true; // Assume it exists to be safe
        }
    }
    /**
     * Converts database record (snake_case) to API format (camelCase)
     * @param dbStudent - Student record from database with snake_case columns
     * @returns Student - Formatted object with camelCase properties
     * @private
     */
    static mapDbToApi(dbStudent) {
        return {
            id: dbStudent.id,
            parentId: dbStudent.parent_id,
            firstName: dbStudent.first_name,
            lastName: dbStudent.last_name,
            dateOfBirth: dbStudent.date_of_birth,
            gradeLevel: dbStudent.grade_level,
            parentKey: dbStudent.parent_key,
            createdAt: dbStudent.created_at,
        };
    }
    /**
     * Retrieves paginated list of students with optional search filtering
     * @param page - Page number (1-indexed, default: 1)
     * @param limit - Items per page (default: 10)
     * @param search - Optional search string to filter by name, grade, or full name
     * @returns Promise<PaginatedStudentsResult> - Paginated students with total count/pages
     * @throws Error on database query failure
     *
     * @example
     * // Get all students
     * const result = await StudentService.getAllStudents(1, 10);
     *
     * // Search students by name
     * const searchResult = await StudentService.getAllStudents(1, 10, "Ahmed");
     */
    static async getAllStudents(page = 1, limit = 10, search = "") {
        try {
            const offset = (page - 1) * limit;
            // Build the WHERE clause for search
            let whereClause = "";
            let queryParams = [];
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
            const [countRows] = await db_1.default.query(countQuery, queryParams);
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
            const [rows] = await db_1.default.query(selectQuery, selectParams);
            return {
                students: rows.map((row) => StudentService.mapDbToApi(row)),
                totalCount,
                totalPages,
            };
        }
        catch (error) {
            console.error("Error fetching all students:", error);
            throw new Error("Failed to fetch students from database");
        }
    }
    static async getStudentById(id) {
        try {
            const [rows] = await db_1.default.query(`SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.id = ?`, [id]);
            return rows[0] ? StudentService.mapDbToApi(rows[0]) : null;
        }
        catch (error) {
            console.error("Error fetching student by ID:", error);
            throw new Error("Failed to fetch student from database");
        }
    }
    static async getStudentsByParent(parent_id) {
        try {
            const [rows] = await db_1.default.query(`SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.parent_id = ? 
         ORDER BY s.grade_level, s.last_name, s.first_name`, [parent_id]);
            return rows.map((row) => StudentService.mapDbToApi(row));
        }
        catch (error) {
            console.error("Error fetching students by parent:", error);
            throw new Error("Failed to fetch students by parent from database");
        }
    }
    static async getStudentsByGrade(grade_level) {
        try {
            const [rows] = await db_1.default.query(`SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.grade_level = ? 
         ORDER BY s.last_name, s.first_name`, [grade_level]);
            return rows.map((row) => StudentService.mapDbToApi(row));
        }
        catch (error) {
            console.error("Error fetching students by grade:", error);
            throw new Error("Failed to fetch students by grade from database");
        }
    }
    static async createStudent(studentData) {
        try {
            // Convert camelCase to underscore_case for database
            const { parentId, firstName, lastName, dateOfBirth, gradeLevel } = studentData;
            // Generate unique parent key
            const parentKey = await (0, parentKeyGenerator_1.generateUniqueParentKey)(StudentService.parentKeyExists);
            const [result] = await db_1.default.query("INSERT INTO students (parent_id, first_name, last_name, date_of_birth, grade_level, parent_key, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())", [
                parentId || null,
                firstName,
                lastName,
                dateOfBirth,
                gradeLevel,
                parentKey,
            ]);
            const insertResult = result;
            const newStudent = await StudentService.getStudentById(insertResult.insertId);
            if (!newStudent) {
                throw new Error("Failed to retrieve created student");
            }
            return newStudent;
        }
        catch (error) {
            console.error("Error creating student:", error);
            if (error.code === "ER_NO_REFERENCED_ROW_2") {
                throw new Error("Parent ID does not exist");
            }
            throw new Error("Failed to create student");
        }
    }
    static async updateStudent(id, studentData) {
        try {
            // Convert camelCase to underscore_case for database
            const { parentId, firstName, lastName, dateOfBirth, gradeLevel } = studentData;
            // Build dynamic update query
            const updateFields = [];
            const updateValues = [];
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
            const [result] = await db_1.default.query(`UPDATE students SET ${updateFields.join(", ")} WHERE id = ?`, updateValues);
            const updateResult = result;
            if (updateResult.affectedRows === 0) {
                return null;
            }
            return await StudentService.getStudentById(id);
        }
        catch (error) {
            console.error("Error updating student:", error);
            if (error.code === "ER_NO_REFERENCED_ROW_2") {
                throw new Error("Parent ID does not exist");
            }
            throw new Error("Failed to update student");
        }
    }
    static async deleteStudent(id) {
        try {
            const [result] = await db_1.default.query("DELETE FROM students WHERE id = ?", [
                id,
            ]);
            const deleteResult = result;
            return deleteResult.affectedRows > 0;
        }
        catch (error) {
            console.error("Error deleting student:", error);
            throw new Error("Failed to delete student");
        }
    }
    static async searchStudents(searchTerm) {
        try {
            const searchPattern = `%${searchTerm}%`;
            const [rows] = await db_1.default.query(`SELECT s.*, 
         p.username as parent_name,
         p.username as parent_username
         FROM students s 
         LEFT JOIN users p ON s.parent_id = p.id 
         WHERE s.first_name LIKE ? 
         OR s.last_name LIKE ? 
         OR s.grade_level LIKE ?
         OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?
         ORDER BY s.last_name, s.first_name`, [searchPattern, searchPattern, searchPattern, searchPattern]);
            return rows.map((row) => StudentService.mapDbToApi(row));
        }
        catch (error) {
            console.error("Error searching students:", error);
            throw new Error("Failed to search students");
        }
    }
    static async getStudentStats() {
        try {
            const [gradeStats] = await db_1.default.query(`SELECT grade_level, COUNT(*) as count 
         FROM students 
         GROUP BY grade_level 
         ORDER BY grade_level`);
            const [totalCount] = await db_1.default.query("SELECT COUNT(*) as total FROM students");
            return {
                totalStudents: totalCount[0].total,
                byGrade: gradeStats,
            };
        }
        catch (error) {
            console.error("Error getting student statistics:", error);
            throw new Error("Failed to get student statistics");
        }
    }
}
exports.StudentService = StudentService;

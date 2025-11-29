import { Request, Response } from "express";
import {
  StudentService,
  CreateStudentData,
  UpdateStudentData,
} from "../services/studentService";

export class StudentController {
  static async getAllStudents(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = (req.query.search as string) || "";

      console.log("Search request received:", { page, limit, search });
      console.log("Query params:", req.query);

      const result = await StudentService.getAllStudents(page, limit, search);

      res.json({
        success: true,
        data: result.students,
        pagination: {
          currentPage: page,
          totalPages: result.totalPages,
          totalItems: result.totalCount,
          itemsPerPage: limit,
          hasNextPage: page < result.totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      console.error("Error in getAllStudents controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch students",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getStudentById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: "Invalid student ID",
        });
        return;
      }

      const student = await StudentService.getStudentById(id);

      if (!student) {
        res.status(404).json({
          success: false,
          error: "Student not found",
        });
        return;
      }

      res.json({
        success: true,
        data: student,
      });
    } catch (error) {
      console.error("Error in getStudentById controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch student",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getStudentsByParent(req: Request, res: Response): Promise<void> {
    try {
      const parent_id = parseInt(req.params.parentId);

      if (isNaN(parent_id)) {
        res.status(400).json({
          success: false,
          error: "Invalid parent ID",
        });
        return;
      }

      const students = await StudentService.getStudentsByParent(parent_id);

      res.json({
        success: true,
        data: students,
        count: students.length,
      });
    } catch (error) {
      console.error("Error in getStudentsByParent controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch students by parent",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getStudentsByGrade(req: Request, res: Response): Promise<void> {
    try {
      const grade_level = req.params.grade;

      if (!grade_level) {
        res.status(400).json({
          success: false,
          error: "Grade level is required",
        });
        return;
      }

      const students = await StudentService.getStudentsByGrade(grade_level);

      res.json({
        success: true,
        data: students,
        count: students.length,
      });
    } catch (error) {
      console.error("Error in getStudentsByGrade controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to fetch students by grade",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async createStudent(req: Request, res: Response): Promise<void> {
    try {
      const {
        parentId,
        firstName,
        lastName,
        dateOfBirth,
        gradeLevel,
      }: CreateStudentData = req.body;

      // Basic validation - parentId is now optional
      if (!firstName || !lastName || !dateOfBirth || !gradeLevel) {
        res.status(400).json({
          success: false,
          error:
            "Required fields: firstName, lastName, dateOfBirth, gradeLevel",
        });
        return;
      }

      // Validate parentId is a number if provided
      if (
        parentId !== undefined &&
        parentId !== null &&
        (typeof parentId !== "number" || parentId <= 0)
      ) {
        res.status(400).json({
          success: false,
          error: "parentId must be a valid positive number",
        });
        return;
      }

      // Validate date format (basic check)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth)) {
        res.status(400).json({
          success: false,
          error: "dateOfBirth must be in YYYY-MM-DD format",
        });
        return;
      }

      // Validate names are not empty strings
      if (firstName.trim() === "" || lastName.trim() === "") {
        res.status(400).json({
          success: false,
          error: "First name and last name cannot be empty",
        });
        return;
      }

      const newStudent = await StudentService.createStudent({
        parentId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth,
        gradeLevel: gradeLevel.trim(),
      });

      res.status(201).json({
        success: true,
        message: "Student created successfully",
        data: newStudent,
      });
    } catch (error) {
      console.error("Error in createStudent controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create student",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async updateStudent(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);
      const {
        parentId,
        firstName,
        lastName,
        dateOfBirth,
        gradeLevel,
      }: UpdateStudentData = req.body;

      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: "Invalid student ID",
        });
        return;
      }

      // Check if at least one field is provided
      if (!parentId && !firstName && !lastName && !dateOfBirth && !gradeLevel) {
        res.status(400).json({
          success: false,
          error: "At least one field must be provided for update",
        });
        return;
      }

      // Validate parentId if provided
      if (
        parentId !== undefined &&
        parentId !== null &&
        (typeof parentId !== "number" || parentId <= 0)
      ) {
        res.status(400).json({
          success: false,
          error: "parentId must be a valid positive number",
        });
        return;
      }

      // Validate date format if provided
      if (dateOfBirth !== undefined) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(dateOfBirth)) {
          res.status(400).json({
            success: false,
            error: "dateOfBirth must be in YYYY-MM-DD format",
          });
          return;
        }
      }

      // Validate names are not empty if provided
      if (
        (firstName !== undefined && firstName.trim() === "") ||
        (lastName !== undefined && lastName.trim() === "") ||
        (gradeLevel !== undefined && gradeLevel.trim() === "")
      ) {
        res.status(400).json({
          success: false,
          error: "Names and grade level cannot be empty",
        });
        return;
      }

      const updateData: UpdateStudentData = {};
      if (parentId !== undefined) updateData.parentId = parentId;
      if (firstName !== undefined) updateData.firstName = firstName.trim();
      if (lastName !== undefined) updateData.lastName = lastName.trim();
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
      if (gradeLevel !== undefined) updateData.gradeLevel = gradeLevel.trim();

      const updatedStudent = await StudentService.updateStudent(id, updateData);

      if (!updatedStudent) {
        res.status(404).json({
          success: false,
          error: "Student not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Student updated successfully",
        data: updatedStudent,
      });
    } catch (error) {
      console.error("Error in updateStudent controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to update student",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async deleteStudent(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        res.status(400).json({
          success: false,
          error: "Invalid student ID",
        });
        return;
      }

      const deleted = await StudentService.deleteStudent(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: "Student not found",
        });
        return;
      }

      res.json({
        success: true,
        message: "Student deleted successfully",
      });
    } catch (error) {
      console.error("Error in deleteStudent controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to delete student",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async searchStudents(req: Request, res: Response): Promise<void> {
    try {
      const { q: searchTerm } = req.query;

      if (!searchTerm || typeof searchTerm !== "string") {
        res.status(400).json({
          success: false,
          error: "Search term (q) is required",
        });
        return;
      }

      const students = await StudentService.searchStudents(searchTerm);

      res.json({
        success: true,
        data: students,
        count: students.length,
        searchTerm: searchTerm,
      });
    } catch (error) {
      console.error("Error in searchStudents controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to search students",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getStudentStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await StudentService.getStudentStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Error in getStudentStats controller:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get student statistics",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }
}

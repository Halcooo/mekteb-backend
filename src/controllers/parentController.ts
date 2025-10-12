import { Request, Response } from "express";
import { ParentService } from "../services/parentService.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    email: string;
    role: string;
  };
}

export class ParentController {
  // Connect to student using parent key
  static async connectToStudent(req: AuthenticatedRequest, res: Response) {
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

      const result = await ParentService.connectToStudent(userId, parentKey);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error("Error connecting to student:", error);
      res.status(500).json({
        success: false,
        message: "Failed to connect to student",
      });
    }
  }

  // Get connected students
  static async getConnectedStudents(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "User not authenticated",
        });
      }

      const students = await ParentService.getConnectedStudents(userId);

      res.json({
        success: true,
        data: students,
      });
    } catch (error) {
      console.error("Error getting connected students:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get connected students",
      });
    }
  }

  // Disconnect from student
  static async disconnectFromStudent(req: AuthenticatedRequest, res: Response) {
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

      const result = await ParentService.disconnectFromStudent(
        userId,
        parseInt(studentId)
      );

      res.json(result);
    } catch (error) {
      console.error("Error disconnecting from student:", error);
      res.status(500).json({
        success: false,
        message: "Failed to disconnect from student",
      });
    }
  }
}

import { Request, Response } from "express";
import { UserService } from "../services/userService";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
        email: string;
        role: string;
      };
    }
  }
}

export class UserController {
  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await UserService.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error in getAllUsers controller:", error);
      res.status(500).json({
        error: "Database query failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async getCurrentUser(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      const user = await UserService.getUserById(req.user.userId);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json(user);
    } catch (error) {
      console.error("Error in getCurrentUser controller:", error);
      res.status(500).json({
        error: "Database query failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }

  static async updateUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.params.id);
      const { firstName, lastName } = req.body;

      if (!firstName || !lastName) {
        res.status(400).json({
          error: "First name and last name are required",
        });
        return;
      }

      const user = await UserService.updateUser(userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.json({ message: "User updated successfully", user });
    } catch (error) {
      console.error("Error in updateUser controller:", error);
      res.status(500).json({
        error: "Failed to update user",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }
}

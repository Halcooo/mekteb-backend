import { Request, Response } from "express";
import { UserService, toPublicUser } from "../services/userService";
import { isValidText, parsePositiveInteger } from "../utils/requestValidation";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        username: string;
        email: string;
        role: string;
        sessionId?: string;
      };
    }
  }
}

export class UserController {
  static async getAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await UserService.getAllUsers();
      res.json(users.map(toPublicUser));
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

      res.json(toPublicUser(user));
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
      const userId = parsePositiveInteger(req.params.id);
      if (userId === null) {
        res.status(400).json({ error: "Invalid user ID" });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }

      if (req.user.userId !== userId && req.user.role !== "admin") {
        res.status(403).json({ error: "You may only update your own profile" });
        return;
      }

      const { firstName, lastName } = req.body ?? {};

      if (!isValidText(firstName) || !isValidText(lastName)) {
        res.status(400).json({
          error: "First name and last name must contain 1 to 100 characters",
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

      res.json({ message: "User updated successfully", user: toPublicUser(user) });
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

import { Request, Response } from "express";
import { UserService } from "../services/userService.js";

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

  // Add more controller methods here as needed
  // static async getUserById(req: Request, res: Response) { ... }
  // static async createUser(req: Request, res: Response) { ... }
  // static async updateUser(req: Request, res: Response) { ... }
  // static async deleteUser(req: Request, res: Response) { ... }
}

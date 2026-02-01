"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const userService_1 = require("../services/userService");
class UserController {
    static async getAllUsers(req, res) {
        try {
            const users = await userService_1.UserService.getAllUsers();
            res.json(users);
        }
        catch (error) {
            console.error("Error in getAllUsers controller:", error);
            res.status(500).json({
                error: "Database query failed",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async getCurrentUser(req, res) {
        try {
            if (!req.user) {
                res.status(401).json({ error: "User not authenticated" });
                return;
            }
            const user = await userService_1.UserService.getUserById(req.user.userId);
            if (!user) {
                res.status(404).json({ error: "User not found" });
                return;
            }
            res.json(user);
        }
        catch (error) {
            console.error("Error in getCurrentUser controller:", error);
            res.status(500).json({
                error: "Database query failed",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
    static async updateUser(req, res) {
        try {
            const userId = parseInt(req.params.id);
            const { firstName, lastName } = req.body;
            if (!firstName || !lastName) {
                res.status(400).json({
                    error: "First name and last name are required",
                });
                return;
            }
            const user = await userService_1.UserService.updateUser(userId, {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
            });
            if (!user) {
                res.status(404).json({ error: "User not found" });
                return;
            }
            res.json({ message: "User updated successfully", user });
        }
        catch (error) {
            console.error("Error in updateUser controller:", error);
            res.status(500).json({
                error: "Failed to update user",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
}
exports.UserController = UserController;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const userService_1 = require("../services/userService");
const requestValidation_1 = require("../utils/requestValidation");
class UserController {
    static async getAllUsers(req, res) {
        try {
            const users = await userService_1.UserService.getAllUsers();
            res.json(users.map(userService_1.toPublicUser));
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
            res.json((0, userService_1.toPublicUser)(user));
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
            const userId = (0, requestValidation_1.parsePositiveInteger)(req.params.id);
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
            if (!(0, requestValidation_1.isValidText)(firstName) || !(0, requestValidation_1.isValidText)(lastName)) {
                res.status(400).json({
                    error: "First name and last name must contain 1 to 100 characters",
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
            res.json({ message: "User updated successfully", user: (0, userService_1.toPublicUser)(user) });
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

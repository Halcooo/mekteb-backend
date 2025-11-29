"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const userService_js_1 = require("../services/userService.js");
class UserController {
    static async getAllUsers(req, res) {
        try {
            const users = await userService_js_1.UserService.getAllUsers();
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
}
exports.UserController = UserController;

import { UserService } from "../services/userService.js";
export class UserController {
    static async getAllUsers(req, res) {
        try {
            const users = await UserService.getAllUsers();
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

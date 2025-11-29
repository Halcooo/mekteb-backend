import { AuthService, } from "../services/authService.js";
export class AuthController {
    static async register(req, res) {
        try {
            const { firstName, lastName, username, email, password, role = "student", } = req.body;
            // Basic validation
            if (!firstName || !lastName || !username || !email || !password) {
                res.status(400).json({
                    success: false,
                    error: "First name, last name, username, email and password are required",
                });
                return;
            }
            // Email format validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                res.status(400).json({
                    success: false,
                    error: "Please provide a valid email address",
                });
                return;
            }
            // Password strength validation
            if (password.length < 6) {
                res.status(400).json({
                    success: false,
                    error: "Password must be at least 6 characters long",
                });
                return;
            }
            const result = await AuthService.register({
                firstName,
                lastName,
                username,
                email,
                password,
                role,
            });
            if (result.success) {
                res.status(201).json({
                    success: true,
                    message: result.message,
                    user: result.user,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    error: result.message,
                });
            }
        }
        catch (error) {
            console.error("Error in register controller:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error during registration",
            });
        }
    }
    static async login(req, res) {
        try {
            const { username, password } = req.body;
            // Basic validation
            if (!username || !password) {
                res.status(400).json({
                    success: false,
                    error: "Username and password are required",
                });
                return;
            }
            const result = await AuthService.login({ username, password });
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    user: result.user,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                });
            }
            else {
                res.status(401).json({
                    success: false,
                    error: result.message,
                });
            }
        }
        catch (error) {
            console.error("Error in login controller:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error during login",
            });
        }
    }
    static async refreshToken(req, res) {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                res.status(400).json({
                    success: false,
                    error: "Refresh token is required",
                });
                return;
            }
            const result = await AuthService.refreshToken(refreshToken);
            if (result.success) {
                res.status(200).json({
                    success: true,
                    message: result.message,
                    user: result.user,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                });
            }
            else {
                res.status(401).json({
                    success: false,
                    error: result.message,
                });
            }
        }
        catch (error) {
            console.error("Error in refresh token controller:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error during token refresh",
            });
        }
    }
    static async logout(req, res) {
        // For JWT, logout is typically handled client-side by removing the token
        // But we can still provide an endpoint for consistency
        try {
            res.status(200).json({
                success: true,
                message: "Logged out successfully",
            });
        }
        catch (error) {
            console.error("Error in logout controller:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error during logout",
            });
        }
    }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const userService_js_1 = require("./userService.js");
const jwtService_js_1 = require("./jwtService.js");
class AuthService {
    static async hashPassword(password) {
        try {
            return await bcrypt_1.default.hash(password, this.SALT_ROUNDS);
        }
        catch (error) {
            console.error("Error hashing password:", error);
            throw new Error("Failed to hash password");
        }
    }
    static async comparePassword(password, hashedPassword) {
        try {
            return await bcrypt_1.default.compare(password, hashedPassword);
        }
        catch (error) {
            console.error("Error comparing passwords:", error);
            throw new Error("Failed to verify password");
        }
    }
    static async register(userData) {
        try {
            const { firstName, lastName, username, email, password, role = "user", } = userData;
            // Check if user already exists (email or username)
            const existingUserByEmail = await userService_js_1.UserService.getUserByEmail(email);
            if (existingUserByEmail) {
                return {
                    success: false,
                    message: "User with this email already exists",
                };
            }
            const existingUserByUsername = await userService_js_1.UserService.getUserByUsername(username);
            if (existingUserByUsername) {
                return {
                    success: false,
                    message: "User with this username already exists",
                };
            }
            // Hash the password
            const hashedPassword = await AuthService.hashPassword(password);
            // Create the user
            const createUserData = {
                username,
                email,
                password: hashedPassword,
                role,
                first_name: firstName,
                last_name: lastName,
            };
            const newUser = await userService_js_1.UserService.createUser(createUserData);
            // Remove password from response
            const { password: _, ...userWithoutPassword } = newUser;
            // Generate JWT tokens
            const { accessToken, refreshToken } = jwtService_js_1.JwtService.generateTokenPair({
                userId: newUser.id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
            });
            return {
                success: true,
                user: userWithoutPassword,
                accessToken,
                refreshToken,
                message: "User registered successfully",
            };
        }
        catch (error) {
            console.error("Error in user registration:", error);
            return {
                success: false,
                message: error instanceof Error ? error.message : "Registration failed",
            };
        }
    }
    static async login(loginData) {
        try {
            const { username, password } = loginData;
            // Find user by username
            const user = await userService_js_1.UserService.getUserByUsername(username);
            if (!user) {
                return {
                    success: false,
                    message: "Invalid username or password",
                };
            }
            // Compare password
            const isPasswordValid = await AuthService.comparePassword(password, user.password);
            if (!isPasswordValid) {
                return {
                    success: false,
                    message: "Invalid username or password",
                };
            }
            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;
            // Generate JWT tokens
            const { accessToken, refreshToken } = jwtService_js_1.JwtService.generateTokenPair({
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            });
            return {
                success: true,
                user: userWithoutPassword,
                accessToken,
                refreshToken,
                message: "Login successful",
            };
        }
        catch (error) {
            console.error("Error in user login:", error);
            return {
                success: false,
                message: "Login failed",
            };
        }
    }
    static async refreshToken(refreshToken) {
        try {
            // Verify refresh token
            const payload = jwtService_js_1.JwtService.verifyRefreshToken(refreshToken);
            if (!payload) {
                return {
                    success: false,
                    message: "Invalid or expired refresh token",
                };
            }
            // Get user data
            const user = await userService_js_1.UserService.getUserById(payload.userId);
            if (!user) {
                return {
                    success: false,
                    message: "User not found",
                };
            }
            // Generate new token pair
            const tokens = jwtService_js_1.JwtService.generateTokenPair({
                userId: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
            });
            // Remove password from response
            const { password: _, ...userWithoutPassword } = user;
            return {
                success: true,
                user: userWithoutPassword,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                message: "Token refreshed successfully",
            };
        }
        catch (error) {
            console.error("Error refreshing token:", error);
            return {
                success: false,
                message: "Token refresh failed",
            };
        }
    }
}
exports.AuthService = AuthService;
AuthService.SALT_ROUNDS = 12;

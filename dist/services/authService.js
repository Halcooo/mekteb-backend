"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const userService_1 = require("./userService");
const jwtService_1 = require("./jwtService");
const sessionService_1 = require("./sessionService");
function authenticated(user, session, message) {
    return {
        success: true, user: (0, userService_1.toPublicUser)(user), sessionId: session.sessionId,
        accessToken: jwtService_1.JwtService.generateAccessToken({
            userId: user.id, username: user.username, email: user.email, role: user.role, sid: session.sessionId,
        }),
        refreshToken: session.refreshToken, expiresAt: session.expiresAt, message,
    };
}
class AuthService {
    static async hashPassword(password) { return bcrypt_1.default.hash(password, 12); }
    static async comparePassword(password, hashedPassword) {
        return bcrypt_1.default.compare(password, hashedPassword);
    }
    static async register(data, userAgent) {
        if (await userService_1.UserService.getUserByEmail(data.email) || await userService_1.UserService.getUserByUsername(data.username)) {
            return { success: false, message: "User with this email or username already exists" };
        }
        const password = await this.hashPassword(data.password);
        const user = await userService_1.UserService.createUser({
            username: data.username, email: data.email, password, role: "parent",
            first_name: data.firstName, last_name: data.lastName,
        });
        const session = await sessionService_1.SessionService.createSession(user.id, { userAgent });
        return authenticated(user, session, "User registered successfully");
    }
    static async login(data, userAgent) {
        const user = await userService_1.UserService.getUserByUsername(data.username);
        if (!user || !await this.comparePassword(data.password, user.password)) {
            return { success: false, message: "Invalid username or password" };
        }
        const session = await sessionService_1.SessionService.createSession(user.id, { userAgent });
        return authenticated(user, session, "Login successful");
    }
    static async refreshToken(raw) {
        const session = await sessionService_1.SessionService.rotateRefreshToken(raw);
        const user = await userService_1.UserService.getUserById(session.userId);
        if (!user) {
            await sessionService_1.SessionService.revokeSession(session.sessionId, session.userId);
            throw new sessionService_1.SessionError("INVALID_REFRESH", session.sessionId, session.userId);
        }
        return authenticated(user, session, "Token refreshed successfully");
    }
}
exports.AuthService = AuthService;

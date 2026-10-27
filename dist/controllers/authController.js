"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const authService_1 = require("../services/authService");
const sessionService_1 = require("../services/sessionService");
const jwtService_1 = require("../services/jwtService");
const notificationHub_1 = require("../services/notificationHub");
const sessionCookie_1 = require("../utils/sessionCookie");
const requestValidation_1 = require("../utils/requestValidation");
async function sendAuthentication(req, res, result, status = 200) {
    if (!result.refreshToken || !result.expiresAt || !result.sessionId || !result.accessToken || !result.user) {
        throw new Error("Incomplete session credentials");
    }
    // Replacing the browser account must not leave its previous session active.
    if (status === 201 || req.path === "/login") {
        const previous = (0, sessionCookie_1.readRefreshCookie)(req);
        if (previous) {
            const revoked = await sessionService_1.SessionService.revokeSessionFromRefresh(previous);
            if (revoked)
                notificationHub_1.NotificationHub.disconnectSession(revoked.sessionId);
        }
    }
    (0, sessionCookie_1.setRefreshCookie)(res, result.refreshToken, result.expiresAt);
    res.status(status).json({ success: true, user: result.user, accessToken: result.accessToken, sessionId: result.sessionId, message: result.message });
}
function authenticationError(res, error) {
    if (error instanceof sessionService_1.SessionError) {
        if (error.sessionId)
            notificationHub_1.NotificationHub.disconnectSession(error.sessionId);
        (0, sessionCookie_1.clearRefreshCookie)(res);
        res.status(401).json({ success: false, error: error.code });
        return;
    }
    // Do not clear a valid cookie on a transient database failure or expose SQL.
    res.status(503).json({ success: false, error: "AUTHENTICATION_UNAVAILABLE" });
}
class AuthController {
    static async register(req, res) {
        const { firstName, lastName, username, email, password } = req.body ?? {};
        if (!(0, requestValidation_1.isValidText)(firstName) || !(0, requestValidation_1.isValidText)(lastName) || !(0, requestValidation_1.isValidText)(username, 100) || !(0, requestValidation_1.isValidText)(email, 254) || typeof password !== "string") {
            res.status(400).json({ success: false, error: "First name, last name, username, email and password are required" });
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            res.status(400).json({ success: false, error: "Please provide a valid email address" });
            return;
        }
        if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
            res.status(400).json({ success: false, error: "Password must contain at least 12 characters and no more than 72 UTF-8 bytes" });
            return;
        }
        try {
            const result = await authService_1.AuthService.register({ firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim(), email: email.trim(), password }, req.get("User-Agent"));
            if (!result.success) {
                res.status(400).json({ success: false, error: result.message });
                return;
            }
            await sendAuthentication(req, res, result, 201);
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async login(req, res) {
        const { username, password } = req.body ?? {};
        if (!(0, requestValidation_1.isValidText)(username, 100) || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 4096) {
            res.status(400).json({ success: false, error: "Username and password are required" });
            return;
        }
        try {
            const result = await authService_1.AuthService.login({ username: username.trim(), password }, req.get("User-Agent"));
            if (!result.success) {
                res.status(401).json({ success: false, error: result.message });
                return;
            }
            await sendAuthentication(req, res, result);
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async refreshToken(req, res) {
        const token = (0, sessionCookie_1.readRefreshCookie)(req);
        if (!token) {
            authenticationError(res, new sessionService_1.SessionError("INVALID_REFRESH"));
            return;
        }
        try {
            await sendAuthentication(req, res, await authService_1.AuthService.refreshToken(token));
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async logout(req, res) {
        try {
            const token = (0, sessionCookie_1.readRefreshCookie)(req);
            if (token) {
                const revoked = await sessionService_1.SessionService.revokeSessionFromRefresh(token);
                if (revoked)
                    notificationHub_1.NotificationHub.disconnectSession(revoked.sessionId);
            }
            (0, sessionCookie_1.clearRefreshCookie)(res);
            res.json({ success: true, message: "Logged out successfully" });
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async logoutAll(req, res) {
        if (!req.user) {
            res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
            return;
        }
        try {
            await sessionService_1.SessionService.revokeAllForUser(req.user.userId);
            notificationHub_1.NotificationHub.disconnectUser(req.user.userId);
            (0, sessionCookie_1.clearRefreshCookie)(res);
            res.json({ success: true, message: "All sessions revoked" });
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async listSessions(req, res) {
        if (!req.user) {
            res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
            return;
        }
        try {
            const sessions = await sessionService_1.SessionService.listActiveForUser(req.user.userId);
            res.json({ success: true, sessions: sessions.map((session) => ({ ...session, current: session.sessionId === req.user.sessionId })) });
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
    static async revokeSession(req, res) {
        if (!req.user) {
            res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" });
            return;
        }
        const id = req.params.id;
        if (typeof id !== "string" || !jwtService_1.SESSION_ID_PATTERN.test(id)) {
            res.status(400).json({ success: false, error: "INVALID_SESSION_ID" });
            return;
        }
        try {
            if (!await sessionService_1.SessionService.revokeSession(id, req.user.userId)) {
                res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" });
                return;
            }
            notificationHub_1.NotificationHub.disconnectSession(id);
            if (id === req.user.sessionId)
                (0, sessionCookie_1.clearRefreshCookie)(res);
            res.json({ success: true });
        }
        catch (error) {
            authenticationError(res, error);
        }
    }
}
exports.AuthController = AuthController;

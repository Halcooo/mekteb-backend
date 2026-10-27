"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireRole = exports.authenticateToken = void 0;
const jwtService_1 = require("../services/jwtService");
const userService_1 = require("../services/userService");
const sessionService_1 = require("../services/sessionService");
/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = jwtService_1.JwtService.extractTokenFromHeader(authHeader);
    if (!token) {
        res.status(401).json({
            success: false,
            message: "Access token is required",
            error: "MISSING_TOKEN",
        });
        return;
    }
    const payload = jwtService_1.JwtService.verifyAccessToken(token);
    if (!payload) {
        res.status(401).json({
            success: false,
            message: "Invalid or expired token",
            error: "INVALID_TOKEN",
        });
        return;
    }
    try {
        if (!await sessionService_1.SessionService.isSessionActive(payload.sid, payload.userId)) {
            res.status(401).json({ success: false, error: "SESSION_REVOKED" });
            return;
        }
        // Old token claims must not retain privileges after an account change.
        const user = await userService_1.UserService.getUserById(payload.userId);
        if (!user) {
            res.status(401).json({ success: false, error: "INVALID_TOKEN" });
            return;
        }
        req.user = { userId: user.id, username: user.username, email: user.email, role: user.role, sessionId: payload.sid };
        res.setHeader("Cache-Control", "no-store");
        next();
    }
    catch {
        res.status(503).json({ success: false, error: "AUTHENTICATION_UNAVAILABLE" });
    }
};
exports.authenticateToken = authenticateToken;
/**
 * Middleware to check if user has required role
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: "Authentication required",
                error: "NOT_AUTHENTICATED",
            });
            return;
        }
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: "Insufficient permissions",
                error: "INSUFFICIENT_PERMISSIONS",
            });
            return;
        }
        next();
    };
};
exports.requireRole = requireRole;
/**
 * Optional authentication middleware - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
    if (req.headers.authorization) {
        await (0, exports.authenticateToken)(req, res, next);
    }
    else {
        next();
    }
};
exports.optionalAuth = optionalAuth;

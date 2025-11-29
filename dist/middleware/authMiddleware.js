"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireRole = exports.authenticateToken = void 0;
const jwtService_1 = require("../services/jwtService");
/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = (req, res, next) => {
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
    // Attach user info to request
    req.user = {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        role: payload.role,
    };
    next();
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
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = jwtService_1.JwtService.extractTokenFromHeader(authHeader);
    if (token) {
        const payload = jwtService_1.JwtService.verifyAccessToken(token);
        if (payload) {
            req.user = {
                userId: payload.userId,
                username: payload.username,
                email: payload.email,
                role: payload.role,
            };
        }
    }
    next();
};
exports.optionalAuth = optionalAuth;

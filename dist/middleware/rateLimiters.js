"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentConnectionLimiter = exports.refreshLimiter = exports.registrationLimiter = exports.loginLimiter = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const message = {
    success: false,
    error: "RATE_LIMITED",
    message: "Too many attempts. Please try again later.",
};
const common = { standardHeaders: "draft-8", legacyHeaders: false, message };
exports.loginLimiter = (0, express_rate_limit_1.rateLimit)({
    ...common, windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true,
});
exports.registrationLimiter = (0, express_rate_limit_1.rateLimit)({
    ...common, windowMs: 60 * 60 * 1000, limit: 10,
});
exports.refreshLimiter = (0, express_rate_limit_1.rateLimit)({
    ...common, windowMs: 15 * 60 * 1000, limit: 120,
});
// Mounted after authentication; the key comes from the verified current user.
exports.parentConnectionLimiter = (0, express_rate_limit_1.rateLimit)({
    ...common, windowMs: 15 * 60 * 1000, limit: 20,
    keyGenerator: (req) => String(req.user.userId),
});

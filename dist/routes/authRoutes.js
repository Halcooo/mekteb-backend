"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const rateLimiters_1 = require("../middleware/rateLimiters");
const authCsrf_1 = require("../middleware/authCsrf");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.use(authCsrf_1.protectAuthMutation);
// POST /api/auth/register - Register a new user
router.post("/register", rateLimiters_1.registrationLimiter, authController_1.AuthController.register);
// POST /api/auth/login - Login existing user
router.post("/login", rateLimiters_1.loginLimiter, authController_1.AuthController.login);
// POST /api/auth/refresh - Refresh access token
router.post("/refresh", rateLimiters_1.refreshLimiter, authController_1.AuthController.refreshToken);
// POST /api/auth/logout - Logout user
router.post("/logout", authController_1.AuthController.logout);
router.post("/logout-all", authMiddleware_1.authenticateToken, authController_1.AuthController.logoutAll);
router.get("/sessions", authMiddleware_1.authenticateToken, authController_1.AuthController.listSessions);
router.delete("/sessions/:id", authMiddleware_1.authenticateToken, authController_1.AuthController.revokeSession);
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const router = (0, express_1.Router)();
// POST /api/auth/register - Register a new user
router.post("/register", authController_1.AuthController.register);
// POST /api/auth/login - Login existing user
router.post("/login", authController_1.AuthController.login);
// POST /api/auth/refresh - Refresh access token
router.post("/refresh", authController_1.AuthController.refreshToken);
// POST /api/auth/logout - Logout user
router.post("/logout", authController_1.AuthController.logout);
exports.default = router;

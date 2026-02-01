"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// GET /api/users - Get all users
router.get("/", userController_1.UserController.getAllUsers);
// GET /api/users/profile - Get current user profile
router.get("/profile", authMiddleware_1.authenticateToken, userController_1.UserController.getCurrentUser);
// PUT /api/users/:id - Update user by ID
router.put("/:id", authMiddleware_1.authenticateToken, userController_1.UserController.updateUser);
exports.default = router;

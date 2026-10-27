"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// GET /api/users - Get all users
router.get("/", (0, authMiddleware_1.requireRole)("admin"), userController_1.UserController.getAllUsers);
// GET /api/users/profile - Get current user profile
router.get("/profile", userController_1.UserController.getCurrentUser);
// PUT /api/users/:id - Update user by ID
router.put("/:id", userController_1.UserController.updateUser);
exports.default = router;

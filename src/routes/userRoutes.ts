import { Router } from "express";
import { UserController } from "../controllers/userController";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();

// GET /api/users - Get all users
router.get("/", UserController.getAllUsers);

// GET /api/users/profile - Get current user profile
router.get("/profile", authenticateToken, UserController.getCurrentUser);

// PUT /api/users/:id - Update user by ID
router.put("/:id", authenticateToken, UserController.updateUser);

export default router;

import { Router } from "express";
import { UserController } from "../controllers/userController";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();
router.use(authenticateToken);

// GET /api/users - Get all users
router.get("/", requireRole("admin"), UserController.getAllUsers);

// GET /api/users/profile - Get current user profile
router.get("/profile", UserController.getCurrentUser);

// PUT /api/users/:id - Update user by ID
router.put("/:id", UserController.updateUser);

export default router;

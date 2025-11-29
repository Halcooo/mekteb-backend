import { Router } from "express";
import { UserController } from "../controllers/userController.js";
const router = Router();
// GET /api/users - Get all users
router.get("/", UserController.getAllUsers);
// Add more user routes here as needed
// router.get("/:id", UserController.getUserById);
// router.post("/", UserController.createUser);
// router.put("/:id", UserController.updateUser);
// router.delete("/:id", UserController.deleteUser);
export default router;

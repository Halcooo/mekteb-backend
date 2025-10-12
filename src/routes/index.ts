import { Router } from "express";
import userRoutes from "./userRoutes.js";
import healthRoutes from "./healthRoutes.js";
import authRoutes from "./authRoutes.js";
import newsRoutes from "./newsRoutes.js";
import studentRoutes from "./studentRoutes.js";
import attendanceRoutes from "./attendanceRoutes.js";
import commentRoutes from "./commentRoutes.js";

const router = Router();

// Mount route modules
router.use("/users", userRoutes);
router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/news", newsRoutes);
router.use("/students", studentRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/comments", commentRoutes);

// Add more route modules here as your application grows
// router.use("/posts", postRoutes);

export default router;

import { Router } from "express";
import userRoutes from "./userRoutes";
import healthRoutes from "./healthRoutes";
import authRoutes from "./authRoutes";
import newsRoutes from "./newsRoutes";
import studentRoutes from "./studentRoutes";
import attendanceRoutes from "./attendanceRoutes";
import commentRoutes from "./commentRoutes";

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

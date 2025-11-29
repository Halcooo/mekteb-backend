"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userRoutes_1 = __importDefault(require("./userRoutes"));
const healthRoutes_1 = __importDefault(require("./healthRoutes"));
const authRoutes_1 = __importDefault(require("./authRoutes"));
const newsRoutes_1 = __importDefault(require("./newsRoutes"));
const studentRoutes_1 = __importDefault(require("./studentRoutes"));
const attendanceRoutes_1 = __importDefault(require("./attendanceRoutes"));
const commentRoutes_1 = __importDefault(require("./commentRoutes"));
const router = (0, express_1.Router)();
// Mount route modules
router.use("/users", userRoutes_1.default);
router.use("/health", healthRoutes_1.default);
router.use("/auth", authRoutes_1.default);
router.use("/news", newsRoutes_1.default);
router.use("/students", studentRoutes_1.default);
router.use("/attendance", attendanceRoutes_1.default);
router.use("/comments", commentRoutes_1.default);
// Add more route modules here as your application grows
// router.use("/posts", postRoutes);
exports.default = router;

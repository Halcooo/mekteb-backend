"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userRoutes_js_1 = __importDefault(require("./userRoutes.js"));
const healthRoutes_js_1 = __importDefault(require("./healthRoutes.js"));
const authRoutes_js_1 = __importDefault(require("./authRoutes.js"));
const newsRoutes_js_1 = __importDefault(require("./newsRoutes.js"));
const studentRoutes_js_1 = __importDefault(require("./studentRoutes.js"));
const attendanceRoutes_js_1 = __importDefault(require("./attendanceRoutes.js"));
const commentRoutes_js_1 = __importDefault(require("./commentRoutes.js"));
const router = (0, express_1.Router)();
// Mount route modules
router.use("/users", userRoutes_js_1.default);
router.use("/health", healthRoutes_js_1.default);
router.use("/auth", authRoutes_js_1.default);
router.use("/news", newsRoutes_js_1.default);
router.use("/students", studentRoutes_js_1.default);
router.use("/attendance", attendanceRoutes_js_1.default);
router.use("/comments", commentRoutes_js_1.default);
// Add more route modules here as your application grows
// router.use("/posts", postRoutes);
exports.default = router;

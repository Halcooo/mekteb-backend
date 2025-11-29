"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const healthRoutes_js_1 = __importDefault(require("./routes/healthRoutes.js"));
const newsRoutes_js_1 = __importDefault(require("./routes/newsRoutes.js"));
const studentRoutes_js_1 = __importDefault(require("./routes/studentRoutes.js"));
const userRoutes_js_1 = __importDefault(require("./routes/userRoutes.js"));
const authRoutes_js_1 = __importDefault(require("./routes/authRoutes.js"));
const attendanceRoutes_js_1 = __importDefault(require("./routes/attendanceRoutes.js"));
const imageRoutes_js_1 = __importDefault(require("./routes/imageRoutes.js"));
const commentRoutes_js_1 = __importDefault(require("./routes/commentRoutes.js"));
const parentRoutes_js_1 = __importDefault(require("./routes/parentRoutes.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
// CORS Configuration - Allow all origins for development
const corsOptions = {
    origin: "https://www.mekteb-pazaric.com",
};
app.use((0, cors_1.default)(corsOptions));
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// API Routes
app.use("/api/health", healthRoutes_js_1.default);
app.use("/api/news", newsRoutes_js_1.default);
app.use("/api/students", studentRoutes_js_1.default);
app.use("/api/users", userRoutes_js_1.default);
app.use("/api/auth", authRoutes_js_1.default);
app.use("/api/images", imageRoutes_js_1.default);
app.use("/api/attendance", attendanceRoutes_js_1.default);
app.use("/api/comments", commentRoutes_js_1.default);
app.use("/api/parent", parentRoutes_js_1.default);
// Root endpoint for basic server status
app.get("/", (req, res) => {
    res.json({
        message: "Server is running!",
        version: "1.0.0",
        endpoints: {
            health: "/api/health",
            users: "/api/users",
            auth: "/api/auth",
            news: "/api/news",
            students: "/api/students",
            attendance: "/api/attendance",
            images: "/api/images",
            comments: "/api/comments",
            parent: "/api/parent",
        },
    });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log("idee");
    console.log(`Server running on http://localhost:${PORT}`);
});

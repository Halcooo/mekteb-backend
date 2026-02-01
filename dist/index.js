"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
// Load environment variables
const envName = process.env.NODE_ENV ?? "development";
const envPath = path_1.default.resolve(process.cwd(), `.env.${envName}`);
if (fs_1.default.existsSync(envPath)) {
    dotenv_1.default.config({ path: envPath });
}
else {
    dotenv_1.default.config();
}
// Import your routes (remove .js extensions)
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const newsRoutes_1 = __importDefault(require("./routes/newsRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const attendanceRoutes_1 = __importDefault(require("./routes/attendanceRoutes"));
const imageRoutes_1 = __importDefault(require("./routes/imageRoutes"));
const commentRoutes_1 = __importDefault(require("./routes/commentRoutes"));
const parentRoutes_1 = __importDefault(require("./routes/parentRoutes"));
const app = (0, express_1.default)();
const API_PREFIX = "/backend/api";
// CORS configuration
const corsOptions = { origin: "*" }; // allow all origins for now
app.use((0, cors_1.default)(corsOptions));
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use(`${API_PREFIX}/uploads/news-images`, express_1.default.static(path_1.default.join(process.cwd(), "uploads/news-images")));
// API Routes
app.use(`${API_PREFIX}/health`, healthRoutes_1.default);
app.use(`${API_PREFIX}/news`, newsRoutes_1.default);
app.use(`${API_PREFIX}/students`, studentRoutes_1.default);
app.use(`${API_PREFIX}/users`, userRoutes_1.default);
app.use(`${API_PREFIX}/auth`, authRoutes_1.default);
app.use(`${API_PREFIX}/attendance`, attendanceRoutes_1.default);
app.use(`${API_PREFIX}/images`, imageRoutes_1.default);
app.use(`${API_PREFIX}/comments`, commentRoutes_1.default);
app.use(`${API_PREFIX}/parent`, parentRoutes_1.default);
// Root endpoint
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
// Use cPanel-provided port
const PORT = process.env.PORT || 5000; // fallback for local dev
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

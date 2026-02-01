import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables
const envName = process.env.NODE_ENV ?? "development";
const envPath = path.resolve(process.cwd(), `.env.${envName}`);
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

// Import your routes (remove .js extensions)
import healthRoutes from "./routes/healthRoutes";
import newsRoutes from "./routes/newsRoutes";
import studentRoutes from "./routes/studentRoutes";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import attendanceRoutes from "./routes/attendanceRoutes";
import imageRoutes from "./routes/imageRoutes";
import commentRoutes from "./routes/commentRoutes";
import parentRoutes from "./routes/parentRoutes";

const app = express();
const API_PREFIX = "/backend/api";

// CORS configuration
const corsOptions = { origin: "*" }; // allow all origins for now
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  `${API_PREFIX}/uploads/news-images`,
  express.static(path.join(process.cwd(), "uploads/news-images")),
);

// API Routes
app.use(`${API_PREFIX}/health`, healthRoutes);
app.use(`${API_PREFIX}/news`, newsRoutes);
app.use(`${API_PREFIX}/students`, studentRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
app.use(`${API_PREFIX}/images`, imageRoutes);
app.use(`${API_PREFIX}/comments`, commentRoutes);
app.use(`${API_PREFIX}/parent`, parentRoutes);

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

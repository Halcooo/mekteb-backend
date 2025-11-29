import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/healthRoutes";
import newsRoutes from "./routes/newsRoutes";
import studentRoutes from "./routes/studentRoutes";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import attendanceRoutes from "./routes/attendanceRoutes";
import imageRoutes from "./routes/imageRoutes";
import commentRoutes from "./routes/commentRoutes";
import parentRoutes from "./routes/parentRoutes";

dotenv.config();
const app = express();

// CORS Configuration - Allow all origins for development

const corsOptions = {
  origin: "*",
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use("/api/health", healthRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/parent", parentRoutes);

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

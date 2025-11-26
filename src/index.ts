import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import healthRoutes from "./routes/healthRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import imageRoutes from "./routes/imageRoutes.js";
import commentRoutes from "./routes/commentRoutes.js";
import parentRoutes from "./routes/parentRoutes.js";

dotenv.config();
const app = express();
const allowedOrigins = [
  "https://mekteb-pazaric.com",
  "https://www.mekteb-pazaric.com"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow non-browser requests (like Postman)
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS not allowed"));
      }
      return callback(null, true);
    },
    credentials: true, // if using cookies/session
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
  console.log(`Server running on http://localhost:${PORT}`);
});

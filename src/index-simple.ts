import express from "express";
import cors from "cors";
import dotenv from "dotenv";

console.log("Starting server...");

dotenv.config();
const app = express();

// CORS Configuration - Allow all origins for development
app.use(cors({
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple test route
app.get("/", (req, res) => {
  res.json({
    message: "Server is running!",
    version: "1.0.0"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
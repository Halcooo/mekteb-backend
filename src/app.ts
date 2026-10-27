import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { getAllowedOrigins } from "./config/environment";
import { JwtService } from "./services/jwtService";
import healthRoutes from "./routes/healthRoutes";
import newsRoutes from "./routes/newsRoutes";
import studentRoutes from "./routes/studentRoutes";
import userRoutes from "./routes/userRoutes";
import authRoutes from "./routes/authRoutes";
import attendanceRoutes from "./routes/attendanceRoutes";
import imageRoutes from "./routes/imageRoutes";
import commentRoutes from "./routes/commentRoutes";
import parentRoutes from "./routes/parentRoutes";
import notificationRoutes from "./routes/notificationRoutes";
import chatRoutes from "./routes/chatRoutes";
import pushRoutes from "./routes/pushRoutes";
import { getPushConfig } from "./config/webPush";
import multer from 'multer';
import {uploadDir} from './middleware/multerConfig';

export function createApp() {
  JwtService.assertConfiguration();
  getPushConfig();
  const allowedOrigins = new Set(getAllowedOrigins());
  const app = express();
  const proxyHops = process.env.TRUST_PROXY_HOPS ?? "0";
  if (!/^\d+$/.test(proxyHops) || Number(proxyHops) > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
  }
  app.set("trust proxy", Number(proxyHops));
  // Public news images may be served from a separate API origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use((req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !allowedOrigins.has(origin)) {
      res.status(403).json({ success: false, error: "ORIGIN_NOT_ALLOWED" });
      return;
    }
    next();
  });
  app.use(cors({ origin: [...allowedOrigins], credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  const prefix = "/backend/api";
  app.use(`${prefix}/uploads/news-images`, express.static(uploadDir));
  app.use(`${prefix}/health`, healthRoutes);
  app.use(`${prefix}/news`, newsRoutes);
  app.use(`${prefix}/students`, studentRoutes);
  app.use(`${prefix}/users`, userRoutes);
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/attendance`, attendanceRoutes);
  app.use(`${prefix}/images`, imageRoutes);
  app.use(`${prefix}/comments`, commentRoutes);
  app.use(`${prefix}/parent`, parentRoutes);
  app.use(`${prefix}/notifications`, notificationRoutes);
  app.use(`${prefix}/chat`, chatRoutes);
  app.use(`${prefix}/push`, pushRoutes);
  app.get("/", (_req, res) => res.json({ message: "Server is running!", version: "1.0.0" }));
  app.use((_req, res) => { res.status(404).json({ success: false, error: "NOT_FOUND" }); });
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" || error instanceof multer.MulterError || error?.message==='INVALID_IMAGE_TYPE' ? 400 : 500;
    res.status(status).json({ success: false, error: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST_BODY" });
  };
  app.use(handleError);
  return app;
}

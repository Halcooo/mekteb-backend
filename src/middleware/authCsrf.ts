import type { RequestHandler } from "express";
import { getAllowedOrigins } from "../config/environment";

// Preflight plus exact Origin protects cookie mutations, including login CSRF.
export const protectAuthMutation: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const origin = req.get("Origin");
  if (!origin || !getAllowedOrigins().includes(origin) || req.get("X-CSRF-Protection") !== "1") {
    res.status(403).json({ success: false, error: "CSRF_REJECTED" });
    return;
  }
  next();
};

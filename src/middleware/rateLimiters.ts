import { rateLimit } from "express-rate-limit";

const message = {
  success: false,
  error: "RATE_LIMITED",
  message: "Too many attempts. Please try again later.",
};
const common = { standardHeaders: "draft-8" as const, legacyHeaders: false, message };

export const loginLimiter = rateLimit({
  ...common, windowMs: 15 * 60 * 1000, limit: 20, skipSuccessfulRequests: true,
});
export const registrationLimiter = rateLimit({
  ...common, windowMs: 60 * 60 * 1000, limit: 10,
});
export const refreshLimiter = rateLimit({
  ...common, windowMs: 15 * 60 * 1000, limit: 120,
});
// Mounted after authentication; the key comes from the verified current user.
export const parentConnectionLimiter = rateLimit({
  ...common, windowMs: 15 * 60 * 1000, limit: 20,
  keyGenerator: (req) => String(req.user!.userId),
});

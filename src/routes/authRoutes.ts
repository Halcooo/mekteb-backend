import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { loginLimiter, registrationLimiter, refreshLimiter } from "../middleware/rateLimiters";
import { protectAuthMutation } from "../middleware/authCsrf";
import { authenticateToken } from "../middleware/authMiddleware";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.use(protectAuthMutation);

// POST /api/auth/register - Register a new user
router.post("/register", registrationLimiter, AuthController.register);

// POST /api/auth/login - Login existing user
router.post("/login", loginLimiter, AuthController.login);

// POST /api/auth/refresh - Refresh access token
router.post("/refresh", refreshLimiter, AuthController.refreshToken);

// POST /api/auth/logout - Logout user
router.post("/logout", AuthController.logout);
router.post("/logout-all", authenticateToken, AuthController.logoutAll);
router.get("/sessions", authenticateToken, AuthController.listSessions);
router.delete("/sessions/:id", authenticateToken, AuthController.revokeSession);

export default router;

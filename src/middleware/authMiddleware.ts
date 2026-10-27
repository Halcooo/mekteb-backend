import { Request, Response, NextFunction } from "express";
import { JwtService } from "../services/jwtService";
import { UserService } from "../services/userService";
import { SessionService } from "../services/sessionService";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    email: string;
    role: string;
    sessionId?: string;
  };
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = JwtService.extractTokenFromHeader(authHeader);

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Access token is required",
      error: "MISSING_TOKEN",
    });
    return;
  }

  const payload = JwtService.verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: "INVALID_TOKEN",
    });
    return;
  }

  try {
    if (!await SessionService.isSessionActive(payload.sid, payload.userId)) {
      res.status(401).json({ success: false, error: "SESSION_REVOKED" });
      return;
    }
    // Old token claims must not retain privileges after an account change.
    const user = await UserService.getUserById(payload.userId);
    if (!user) {
      res.status(401).json({ success: false, error: "INVALID_TOKEN" });
      return;
    }
    req.user = { userId: user.id, username: user.username, email: user.email, role: user.role, sessionId: payload.sid };
    res.setHeader("Cache-Control", "no-store");
    next();
  } catch {
    res.status(503).json({ success: false, error: "AUTHENTICATION_UNAVAILABLE" });
  }
};

/**
 * Middleware to check if user has required role
 */
export const requireRole = (roles: string | string[]) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: "NOT_AUTHENTICATED",
      });
      return;
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions",
        error: "INSUFFICIENT_PERMISSIONS",
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (req.headers.authorization) {
    await authenticateToken(req, res, next);
  } else {
    next();
  }
};

export type { AuthenticatedRequest };

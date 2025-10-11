import { Request, Response, NextFunction } from "express";
import { JwtService } from "../services/jwtService.js";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    username: string;
    email: string;
    role: string;
  };
}

/**
 * Middleware to authenticate JWT tokens
 */
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
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

  // Attach user info to request
  req.user = {
    userId: payload.userId,
    username: payload.username,
    email: payload.email,
    role: payload.role,
  };

  next();
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
export const optionalAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = JwtService.extractTokenFromHeader(authHeader);

  if (token) {
    const payload = JwtService.verifyAccessToken(token);
    if (payload) {
      req.user = {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        role: payload.role,
      };
    }
  }

  next();
};

export type { AuthenticatedRequest };

import { Request, Response } from "express";
import { AuthService, AuthResult } from "../services/authService";
import { SessionService, SessionError } from "../services/sessionService";
import { SESSION_ID_PATTERN } from "../services/jwtService";
import { NotificationHub } from "../services/notificationHub";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "../utils/sessionCookie";
import { isValidText } from "../utils/requestValidation";

async function sendAuthentication(req: Request, res: Response, result: AuthResult, status = 200): Promise<void> {
  if (!result.refreshToken || !result.expiresAt || !result.sessionId || !result.accessToken || !result.user) {
    throw new Error("Incomplete session credentials");
  }
  // Replacing the browser account must not leave its previous session active.
  if (status === 201 || req.path === "/login") {
    const previous = readRefreshCookie(req);
    if (previous) {
      const revoked = await SessionService.revokeSessionFromRefresh(previous);
      if (revoked) NotificationHub.disconnectSession(revoked.sessionId);
    }
  }
  setRefreshCookie(res, result.refreshToken, result.expiresAt);
  res.status(status).json({ success: true, user: result.user, accessToken: result.accessToken, sessionId: result.sessionId, message: result.message });
}

function authenticationError(res: Response, error: unknown): void {
  if (error instanceof SessionError) {
    if (error.sessionId) NotificationHub.disconnectSession(error.sessionId);
    clearRefreshCookie(res);
    res.status(401).json({ success: false, error: error.code });
    return;
  }
  // Do not clear a valid cookie on a transient database failure or expose SQL.
  res.status(503).json({ success: false, error: "AUTHENTICATION_UNAVAILABLE" });
}

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    const { firstName, lastName, username, email, password } = req.body ?? {};
    if (!isValidText(firstName) || !isValidText(lastName) || !isValidText(username, 100) || !isValidText(email, 254) || typeof password !== "string") {
      res.status(400).json({ success: false, error: "First name, last name, username, email and password are required" }); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ success: false, error: "Please provide a valid email address" }); return;
    }
    if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
      res.status(400).json({ success: false, error: "Password must contain at least 12 characters and no more than 72 UTF-8 bytes" }); return;
    }
    try {
      const result = await AuthService.register({ firstName: firstName.trim(), lastName: lastName.trim(), username: username.trim(), email: email.trim(), password }, req.get("User-Agent"));
      if (!result.success) { res.status(400).json({ success: false, error: result.message }); return; }
      await sendAuthentication(req, res, result, 201);
    } catch (error) { authenticationError(res, error); }
  }

  static async login(req: Request, res: Response): Promise<void> {
    const { username, password } = req.body ?? {};
    if (!isValidText(username, 100) || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 4096) {
      res.status(400).json({ success: false, error: "Username and password are required" }); return;
    }
    try {
      const result = await AuthService.login({ username: username.trim(), password }, req.get("User-Agent"));
      if (!result.success) { res.status(401).json({ success: false, error: result.message }); return; }
      await sendAuthentication(req, res, result);
    } catch (error) { authenticationError(res, error); }
  }

  static async refreshToken(req: Request, res: Response): Promise<void> {
    const token = readRefreshCookie(req);
    if (!token) { authenticationError(res, new SessionError("INVALID_REFRESH")); return; }
    try { await sendAuthentication(req, res, await AuthService.refreshToken(token)); }
    catch (error) { authenticationError(res, error); }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const token = readRefreshCookie(req);
      if (token) {
        const revoked = await SessionService.revokeSessionFromRefresh(token);
        if (revoked) NotificationHub.disconnectSession(revoked.sessionId);
      }
      clearRefreshCookie(res);
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) { authenticationError(res, error); }
  }

  static async logoutAll(req: Request, res: Response): Promise<void> {
    if (!req.user) { res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" }); return; }
    try {
      await SessionService.revokeAllForUser(req.user.userId);
      NotificationHub.disconnectUser(req.user.userId);
      clearRefreshCookie(res);
      res.json({ success: true, message: "All sessions revoked" });
    } catch (error) { authenticationError(res, error); }
  }

  static async listSessions(req: Request, res: Response): Promise<void> {
    if (!req.user) { res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" }); return; }
    try {
      const sessions = await SessionService.listActiveForUser(req.user.userId);
      res.json({ success: true, sessions: sessions.map((session) => ({ ...session, current: session.sessionId === req.user!.sessionId })) });
    } catch (error) { authenticationError(res, error); }
  }

  static async revokeSession(req: Request, res: Response): Promise<void> {
    if (!req.user) { res.status(401).json({ success: false, error: "NOT_AUTHENTICATED" }); return; }
    const id = req.params.id;
    if (typeof id !== "string" || !SESSION_ID_PATTERN.test(id)) { res.status(400).json({ success: false, error: "INVALID_SESSION_ID" }); return; }
    try {
      if (!await SessionService.revokeSession(id, req.user.userId)) { res.status(404).json({ success: false, error: "SESSION_NOT_FOUND" }); return; }
      NotificationHub.disconnectSession(id);
      if (id === req.user.sessionId) clearRefreshCookie(res);
      res.json({ success: true });
    } catch (error) { authenticationError(res, error); }
  }
}

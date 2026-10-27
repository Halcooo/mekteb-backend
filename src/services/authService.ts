import bcrypt from "bcrypt";
import { UserService, PublicUser, User, toPublicUser } from "./userService";
import { JwtService } from "./jwtService";
import { SessionService, SessionCredentials, SessionError } from "./sessionService";

export interface LoginData { username: string; password: string }
export interface RegisterData extends LoginData { firstName: string; lastName: string; email: string }
export interface AuthResult {
  success: boolean;
  user?: PublicUser;
  accessToken?: string;
  sessionId?: string;
  // Internal credentials: controllers put these in an HttpOnly cookie, never JSON.
  refreshToken?: string;
  expiresAt?: Date;
  message?: string;
}

function authenticated(user: User, session: SessionCredentials, message: string): AuthResult {
  return {
    success: true, user: toPublicUser(user), sessionId: session.sessionId,
    accessToken: JwtService.generateAccessToken({
      userId: user.id, username: user.username, email: user.email, role: user.role, sid: session.sessionId,
    }),
    refreshToken: session.refreshToken, expiresAt: session.expiresAt, message,
  };
}

export class AuthService {
  static async hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12); }
  static async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  static async register(data: RegisterData, userAgent?: string): Promise<AuthResult> {
    if (await UserService.getUserByEmail(data.email) || await UserService.getUserByUsername(data.username)) {
      return { success: false, message: "User with this email or username already exists" };
    }
    const password = await this.hashPassword(data.password);
    const user = await UserService.createUser({
      username: data.username, email: data.email, password, role: "parent",
      first_name: data.firstName, last_name: data.lastName,
    });
    const session = await SessionService.createSession(user.id, { userAgent });
    return authenticated(user, session, "User registered successfully");
  }

  static async login(data: LoginData, userAgent?: string): Promise<AuthResult> {
    const user = await UserService.getUserByUsername(data.username);
    if (!user || !await this.comparePassword(data.password, user.password)) {
      return { success: false, message: "Invalid username or password" };
    }
    const session = await SessionService.createSession(user.id, { userAgent });
    return authenticated(user, session, "Login successful");
  }

  static async refreshToken(raw: string): Promise<AuthResult> {
    const session = await SessionService.rotateRefreshToken(raw);
    const user = await UserService.getUserById(session.userId);
    if (!user) {
      await SessionService.revokeSession(session.sessionId, session.userId);
      throw new SessionError("INVALID_REFRESH", session.sessionId, session.userId);
    }
    return authenticated(user, session, "Token refreshed successfully");
  }
}

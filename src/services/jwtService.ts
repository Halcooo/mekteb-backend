import jwt from "jsonwebtoken";
import { createHmac, randomUUID } from "node:crypto";
import "../config/environment";

export interface AccessTokenInput {
  userId: number;
  username: string;
  email: string;
  role: string;
  sid: string;
}

export interface JwtPayload extends AccessTokenInput {
  jti: string;
  exp: number;
}

export const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value || Buffer.byteLength(value, "utf8") < 32 || /^(change[-_ ]?me|your[-_ ]|fallback)/i.test(value)) {
    throw new Error(`${name} must be a unique random secret of at least 32 bytes`);
  }
  return value;
}

function durationSeconds(name: string, fallback: string, maximum: number): number {
  const value = process.env[name] ?? fallback;
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(value);
  const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = match ? Number(match[1]) * multiplier[match[2]] : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > maximum) {
    throw new Error(`${name} must be a positive duration no greater than ${maximum} seconds`);
  }
  return seconds;
}

// The lifetime is absolute from login; refresh never extends it.
export function getSessionLifetimeSeconds(): number {
  return durationSeconds("JWT_REFRESH_EXPIRE", "30d", 365 * 86400);
}

export class JwtService {
  static assertConfiguration(): void {
    if (getSecret("JWT_SECRET") === getSecret("JWT_REFRESH_SECRET")) {
      throw new Error("Access signing and refresh hashing must use different secrets");
    }
    durationSeconds("JWT_EXPIRE", "15m", 15 * 60);
    getSessionLifetimeSeconds();
  }

  // Refresh credentials are opaque random strings. Only this keyed digest is persisted.
  static hashRefreshToken(rawToken: string): string {
    return createHmac("sha256", getSecret("JWT_REFRESH_SECRET")).update(rawToken).digest("hex");
  }

  static generateAccessToken(payload: AccessTokenInput): string {
    this.assertConfiguration();
    if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0 || !SESSION_ID_PATTERN.test(payload.sid)) {
      throw new Error("An access token requires a valid user and persisted session ID");
    }
    return jwt.sign(
      {
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        role: payload.role,
        sid: payload.sid,
        jti: randomUUID(),
        tokenType: "access",
      },
      getSecret("JWT_SECRET"),
      {
        algorithm: "HS256",
        expiresIn: durationSeconds("JWT_EXPIRE", "15m", 15 * 60),
        issuer: "mekteb-app",
        audience: "mekteb-users",
      },
    );
  }

  static verifyAccessToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, getSecret("JWT_SECRET"), {
        algorithms: ["HS256"], issuer: "mekteb-app", audience: "mekteb-users",
      });
      if (
        typeof decoded === "string" || decoded.tokenType !== "access" ||
        !Number.isSafeInteger(decoded.userId) || decoded.userId <= 0 ||
        typeof decoded.exp !== "number" ||
        typeof decoded.sid !== "string" || !SESSION_ID_PATTERN.test(decoded.sid) ||
        typeof decoded.jti !== "string" || !SESSION_ID_PATTERN.test(decoded.jti) ||
        ![decoded.username, decoded.email, decoded.role].every((value) => typeof value === "string")
      ) return null;
      return decoded as unknown as JwtPayload;
    } catch {
      return null;
    }
  }

  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    const match = authHeader?.match(/^Bearer ([^\s]+)$/i);
    return match?.[1] ?? null;
  }

  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token);
      return decoded && typeof decoded !== "string" && typeof decoded.exp === "number"
        ? new Date(decoded.exp * 1000)
        : null;
    } catch {
      return null;
    }
  }
}

export default JwtService;

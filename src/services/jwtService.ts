import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

interface JwtPayload {
  userId: number;
  username: string;
  email: string;
  role: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JwtService {
  private static readonly JWT_SECRET =
    process.env.JWT_SECRET || "fallback-secret";
  private static readonly JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
  private static readonly JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET || "fallback-refresh-secret";
  private static readonly JWT_REFRESH_EXPIRE =
    process.env.JWT_REFRESH_EXPIRE || "30d";

  /**
   * Generate access and refresh token pair
   */
  static generateTokenPair(payload: JwtPayload): TokenPair {
    const accessToken = jwt.sign(payload as any, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRE,
      issuer: "mekteb-app",
      audience: "mekteb-users",
    } as any);

    const refreshToken = jwt.sign(
      { userId: payload.userId } as any,
      this.JWT_REFRESH_SECRET,
      {
        expiresIn: this.JWT_REFRESH_EXPIRE,
        issuer: "mekteb-app",
        audience: "mekteb-users",
      } as any
    );

    return { accessToken, refreshToken };
  }

  /**
   * Generate only access token
   */
  static generateAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload as any, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRE,
      issuer: "mekteb-app",
      audience: "mekteb-users",
    } as any);
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): JwtPayload | null {
    try {
      // Try with issuer and audience first (new tokens)
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: "mekteb-app",
        audience: "mekteb-users",
      }) as JwtPayload;
      return decoded;
    } catch (error) {
      try {
        // Fallback for old tokens without issuer/audience
        const decoded = jwt.verify(token, this.JWT_SECRET) as JwtPayload;
        return decoded;
      } catch (fallbackError) {
        console.error("JWT verification failed:", error);
        return null;
      }
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): { userId: number } | null {
    try {
      // Try with issuer and audience first (new tokens)
      const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET, {
        issuer: "mekteb-app",
        audience: "mekteb-users",
      }) as { userId: number };
      return decoded;
    } catch (error) {
      try {
        // Fallback for old tokens without issuer/audience
        const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET) as {
          userId: number;
        };
        return decoded;
      } catch (fallbackError) {
        console.error("Refresh token verification failed:", error);
        return null;
      }
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Get token expiration time
   */
  static getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      return null;
    } catch (error) {
      return null;
    }
  }
}

export default JwtService;

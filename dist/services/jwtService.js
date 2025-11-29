import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
export class JwtService {
    /**
     * Generate access and refresh token pair
     */
    static generateTokenPair(payload) {
        const accessToken = jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRE,
            issuer: "mekteb-app",
            audience: "mekteb-users",
        });
        const refreshToken = jwt.sign({ userId: payload.userId }, this.JWT_REFRESH_SECRET, {
            expiresIn: this.JWT_REFRESH_EXPIRE,
            issuer: "mekteb-app",
            audience: "mekteb-users",
        });
        return { accessToken, refreshToken };
    }
    /**
     * Generate only access token
     */
    static generateAccessToken(payload) {
        return jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRE,
            issuer: "mekteb-app",
            audience: "mekteb-users",
        });
    }
    /**
     * Verify access token
     */
    static verifyAccessToken(token) {
        try {
            // Try with issuer and audience first (new tokens)
            const decoded = jwt.verify(token, this.JWT_SECRET, {
                issuer: "mekteb-app",
                audience: "mekteb-users",
            });
            return decoded;
        }
        catch (error) {
            try {
                // Fallback for old tokens without issuer/audience
                const decoded = jwt.verify(token, this.JWT_SECRET);
                return decoded;
            }
            catch (fallbackError) {
                console.error("JWT verification failed:", error);
                return null;
            }
        }
    }
    /**
     * Verify refresh token
     */
    static verifyRefreshToken(token) {
        try {
            // Try with issuer and audience first (new tokens)
            const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET, {
                issuer: "mekteb-app",
                audience: "mekteb-users",
            });
            return decoded;
        }
        catch (error) {
            try {
                // Fallback for old tokens without issuer/audience
                const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET);
                return decoded;
            }
            catch (fallbackError) {
                console.error("Refresh token verification failed:", error);
                return null;
            }
        }
    }
    /**
     * Extract token from Authorization header
     */
    static extractTokenFromHeader(authHeader) {
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        return authHeader.substring(7); // Remove 'Bearer ' prefix
    }
    /**
     * Get token expiration time
     */
    static getTokenExpiration(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.exp) {
                return new Date(decoded.exp * 1000);
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
}
JwtService.JWT_SECRET = process.env.JWT_SECRET || "fallback-secret";
JwtService.JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
JwtService.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "fallback-refresh-secret";
JwtService.JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || "30d";
export default JwtService;

import bcrypt from "bcrypt";
import { UserService, User, CreateUserData } from "./userService.js";
import { JwtService } from "./jwtService.js";

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: string;
}

export interface AuthResult {
  success: boolean;
  user?: Omit<User, "password">;
  accessToken?: string;
  refreshToken?: string;
  message?: string;
}

export class AuthService {
  private static readonly SALT_ROUNDS = 12;

  static async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.SALT_ROUNDS);
    } catch (error) {
      console.error("Error hashing password:", error);
      throw new Error("Failed to hash password");
    }
  }

  static async comparePassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      console.error("Error comparing passwords:", error);
      throw new Error("Failed to verify password");
    }
  }

  static async register(userData: RegisterData): Promise<AuthResult> {
    try {
      const {
        firstName,
        lastName,
        username,
        email,
        password,
        role = "user",
      } = userData;

      // Check if user already exists (email or username)
      const existingUserByEmail = await UserService.getUserByEmail(email);
      if (existingUserByEmail) {
        return {
          success: false,
          message: "User with this email already exists",
        };
      }

      const existingUserByUsername = await UserService.getUserByUsername(
        username
      );
      if (existingUserByUsername) {
        return {
          success: false,
          message: "User with this username already exists",
        };
      }

      // Hash the password
      const hashedPassword = await AuthService.hashPassword(password);

      // Create the user
      const createUserData: CreateUserData = {
        username,
        email,
        password: hashedPassword,
        role,
        first_name: firstName,
        last_name: lastName,
      };

      const newUser = await UserService.createUser(createUserData);

      // Remove password from response
      const { password: _, ...userWithoutPassword } = newUser;

      // Generate JWT tokens
      const { accessToken, refreshToken } = JwtService.generateTokenPair({
        userId: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      });

      return {
        success: true,
        user: userWithoutPassword,
        accessToken,
        refreshToken,
        message: "User registered successfully",
      };
    } catch (error) {
      console.error("Error in user registration:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Registration failed",
      };
    }
  }

  static async login(loginData: LoginData): Promise<AuthResult> {
    try {
      const { username, password } = loginData;

      // Find user by username
      const user = await UserService.getUserByUsername(username);
      if (!user) {
        return {
          success: false,
          message: "Invalid username or password",
        };
      }

      // Compare password
      const isPasswordValid = await AuthService.comparePassword(
        password,
        user.password
      );
      if (!isPasswordValid) {
        return {
          success: false,
          message: "Invalid username or password",
        };
      }

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      // Generate JWT tokens
      const { accessToken, refreshToken } = JwtService.generateTokenPair({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      });

      return {
        success: true,
        user: userWithoutPassword,
        accessToken,
        refreshToken,
        message: "Login successful",
      };
    } catch (error) {
      console.error("Error in user login:", error);
      return {
        success: false,
        message: "Login failed",
      };
    }
  }

  static async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      // Verify refresh token
      const payload = JwtService.verifyRefreshToken(refreshToken);
      if (!payload) {
        return {
          success: false,
          message: "Invalid or expired refresh token",
        };
      }

      // Get user data
      const user = await UserService.getUserById(payload.userId);
      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      // Generate new token pair
      const tokens = JwtService.generateTokenPair({
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      });

      // Remove password from response
      const { password: _, ...userWithoutPassword } = user;

      return {
        success: true,
        user: userWithoutPassword,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        message: "Token refreshed successfully",
      };
    } catch (error) {
      console.error("Error refreshing token:", error);
      return {
        success: false,
        message: "Token refresh failed",
      };
    }
  }
}

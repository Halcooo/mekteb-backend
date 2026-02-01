import pool from "../db";
import { RowDataPacket } from "mysql2";

export interface User extends RowDataPacket {
  id: number;
  username: string;
  email: string;
  role: string;
  password: string;
  first_name: string;
  last_name: string;
  created_at?: Date;
}

export interface CreateUserData {
  username: string;
  email: string;
  role: string;
  password: string;
  first_name: string;
  last_name: string;
}

export class UserService {
  static async getAllUsers(): Promise<User[]> {
    try {
      const [rows] = await pool.query<User[]>("SELECT * FROM users");
      return rows;
    } catch (error) {
      console.error("Error fetching users:", error);
      throw new Error("Failed to fetch users from database");
    }
  }

  static async getUserById(id: number): Promise<User | null> {
    try {
      const [rows] = await pool.query<User[]>(
        "SELECT * FROM users WHERE id = ?",
        [id],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error fetching user by ID:", error);
      throw new Error("Failed to fetch user from database");
    }
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    try {
      const [rows] = await pool.query<User[]>(
        "SELECT * FROM users WHERE email = ?",
        [email],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error fetching user by email:", error);
      throw new Error("Failed to fetch user from database");
    }
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    try {
      const [rows] = await pool.query<User[]>(
        "SELECT * FROM users WHERE username = ?",
        [username],
      );
      return rows[0] || null;
    } catch (error) {
      console.error("Error fetching user by username:", error);
      throw new Error("Failed to fetch user from database");
    }
  }

  static async createUser(userData: CreateUserData): Promise<User> {
    try {
      const { username, email, password, role, first_name, last_name } =
        userData;
      const [result] = await pool.query(
        "INSERT INTO users (username, email, password, role, first_name, last_name, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
        [username, email, password, role, first_name, last_name],
      );

      const insertResult = result as any;
      const newUser = await UserService.getUserById(insertResult.insertId);

      if (!newUser) {
        throw new Error("Failed to retrieve created user");
      }

      return newUser;
    } catch (error) {
      console.error("Error creating user:", error);
      if ((error as any).code === "ER_DUP_ENTRY") {
        throw new Error("User with this email or username already exists");
      }
      throw new Error("Failed to create user");
    }
  }

  static async updateUser(
    id: number,
    updateData: Partial<{ firstName: string; lastName: string }>,
  ): Promise<User | null> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (updateData.firstName) {
        updates.push("first_name = ?");
        values.push(updateData.firstName);
      }

      if (updateData.lastName) {
        updates.push("last_name = ?");
        values.push(updateData.lastName);
      }

      if (updates.length === 0) {
        return await UserService.getUserById(id);
      }

      values.push(id);

      const query = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
      await pool.query(query, values);

      return await UserService.getUserById(id);
    } catch (error) {
      console.error("Error updating user:", error);
      throw new Error("Failed to update user");
    }
  }
}

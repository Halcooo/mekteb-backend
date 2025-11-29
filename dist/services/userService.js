import pool from "../db.js";
export class UserService {
    static async getAllUsers() {
        try {
            const [rows] = await pool.query("SELECT * FROM users");
            return rows;
        }
        catch (error) {
            console.error("Error fetching users:", error);
            throw new Error("Failed to fetch users from database");
        }
    }
    static async getUserById(id) {
        try {
            const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching user by ID:", error);
            throw new Error("Failed to fetch user from database");
        }
    }
    static async getUserByEmail(email) {
        try {
            const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching user by email:", error);
            throw new Error("Failed to fetch user from database");
        }
    }
    static async getUserByUsername(username) {
        try {
            const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
            return rows[0] || null;
        }
        catch (error) {
            console.error("Error fetching user by username:", error);
            throw new Error("Failed to fetch user from database");
        }
    }
    static async createUser(userData) {
        try {
            const { username, email, password, role, first_name, last_name } = userData;
            const [result] = await pool.query("INSERT INTO users (username, email, password, role, first_name, last_name, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())", [username, email, password, role, first_name, last_name]);
            const insertResult = result;
            const newUser = await UserService.getUserById(insertResult.insertId);
            if (!newUser) {
                throw new Error("Failed to retrieve created user");
            }
            return newUser;
        }
        catch (error) {
            console.error("Error creating user:", error);
            if (error.code === "ER_DUP_ENTRY") {
                throw new Error("User with this email or username already exists");
            }
            throw new Error("Failed to create user");
        }
    }
}

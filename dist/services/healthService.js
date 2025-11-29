import pool from "../db.js";
export class HealthService {
    static async checkDatabaseConnection() {
        try {
            const [rows] = await pool.query("SELECT NOW() AS time");
            const timeRow = rows[0];
            return timeRow.time;
        }
        catch (error) {
            console.error("Database health check failed:", error);
            throw new Error("Database connection failed");
        }
    }
}

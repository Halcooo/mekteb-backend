import pool from "../db";
import { RowDataPacket } from "mysql2";

export interface HealthCheckResult extends RowDataPacket {
  time: Date;
}

export class HealthService {
  static async checkDatabaseConnection(): Promise<Date> {
    try {
      const [rows] = await pool.query<HealthCheckResult[]>(
        "SELECT NOW() AS time"
      );
      const timeRow = rows[0];
      return timeRow.time;
    } catch (error) {
      console.error("Database health check failed:", error);
      throw new Error("Database connection failed");
    }
  }
}

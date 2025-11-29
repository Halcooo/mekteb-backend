"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const db_1 = __importDefault(require("../db"));
class HealthService {
    static async checkDatabaseConnection() {
        try {
            const [rows] = await db_1.default.query("SELECT NOW() AS time");
            const timeRow = rows[0];
            return timeRow.time;
        }
        catch (error) {
            console.error("Database health check failed:", error);
            throw new Error("Database connection failed");
        }
    }
}
exports.HealthService = HealthService;

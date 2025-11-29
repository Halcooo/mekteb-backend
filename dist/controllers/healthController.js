"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const healthService_js_1 = require("../services/healthService.js");
class HealthController {
    static async checkHealth(req, res) {
        try {
            const time = await healthService_js_1.HealthService.checkDatabaseConnection();
            res.json({
                message: "DB Connected!",
                time: time,
                status: "healthy",
            });
        }
        catch (error) {
            console.error("Error in health check controller:", error);
            res.status(500).json({
                error: "Database connection failed",
                status: "unhealthy",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    }
}
exports.HealthController = HealthController;

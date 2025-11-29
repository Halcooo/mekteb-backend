import { HealthService } from "../services/healthService.js";
export class HealthController {
    static async checkHealth(req, res) {
        try {
            const time = await HealthService.checkDatabaseConnection();
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

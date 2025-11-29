import { Router } from "express";
import { HealthController } from "../controllers/healthController.js";
const router = Router();
// GET /api/health - Check database connection and server health
router.get("/", HealthController.checkHealth);
export default router;

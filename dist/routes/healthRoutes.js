"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthController_1 = require("../controllers/healthController");
const router = (0, express_1.Router)();
// GET /api/health - Check database connection and server health
router.get("/", healthController_1.HealthController.checkHealth);
exports.default = router;

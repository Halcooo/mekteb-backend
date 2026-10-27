"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.protectAuthMutation = void 0;
const environment_1 = require("../config/environment");
// Preflight plus exact Origin protects cookie mutations, including login CSRF.
const protectAuthMutation = (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        next();
        return;
    }
    const origin = req.get("Origin");
    if (!origin || !(0, environment_1.getAllowedOrigins)().includes(origin) || req.get("X-CSRF-Protection") !== "1") {
        res.status(403).json({ success: false, error: "CSRF_REJECTED" });
        return;
    }
    next();
};
exports.protectAuthMutation = protectAuthMutation;

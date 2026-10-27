"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const environment_1 = require("./config/environment");
const jwtService_1 = require("./services/jwtService");
const healthRoutes_1 = __importDefault(require("./routes/healthRoutes"));
const newsRoutes_1 = __importDefault(require("./routes/newsRoutes"));
const studentRoutes_1 = __importDefault(require("./routes/studentRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const attendanceRoutes_1 = __importDefault(require("./routes/attendanceRoutes"));
const imageRoutes_1 = __importDefault(require("./routes/imageRoutes"));
const commentRoutes_1 = __importDefault(require("./routes/commentRoutes"));
const parentRoutes_1 = __importDefault(require("./routes/parentRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const chatRoutes_1 = __importDefault(require("./routes/chatRoutes"));
const pushRoutes_1 = __importDefault(require("./routes/pushRoutes"));
const webPush_1 = require("./config/webPush");
const multer_1 = __importDefault(require("multer"));
const multerConfig_1 = require("./middleware/multerConfig");
function createApp() {
    jwtService_1.JwtService.assertConfiguration();
    (0, webPush_1.getPushConfig)();
    const allowedOrigins = new Set((0, environment_1.getAllowedOrigins)());
    const app = (0, express_1.default)();
    const proxyHops = process.env.TRUST_PROXY_HOPS ?? "0";
    if (!/^\d+$/.test(proxyHops) || Number(proxyHops) > 10) {
        throw new Error("TRUST_PROXY_HOPS must be an integer between 0 and 10");
    }
    app.set("trust proxy", Number(proxyHops));
    // Public news images may be served from a separate API origin.
    app.use((0, helmet_1.default)({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
    app.use((req, res, next) => {
        const origin = req.get("Origin");
        if (origin && !allowedOrigins.has(origin)) {
            res.status(403).json({ success: false, error: "ORIGIN_NOT_ALLOWED" });
            return;
        }
        next();
    });
    app.use((0, cors_1.default)({ origin: [...allowedOrigins], credentials: true }));
    app.use(express_1.default.json({ limit: "100kb" }));
    app.use(express_1.default.urlencoded({ extended: false, limit: "100kb" }));
    const prefix = "/backend/api";
    app.use(`${prefix}/uploads/news-images`, express_1.default.static(multerConfig_1.uploadDir));
    app.use(`${prefix}/health`, healthRoutes_1.default);
    app.use(`${prefix}/news`, newsRoutes_1.default);
    app.use(`${prefix}/students`, studentRoutes_1.default);
    app.use(`${prefix}/users`, userRoutes_1.default);
    app.use(`${prefix}/auth`, authRoutes_1.default);
    app.use(`${prefix}/attendance`, attendanceRoutes_1.default);
    app.use(`${prefix}/images`, imageRoutes_1.default);
    app.use(`${prefix}/comments`, commentRoutes_1.default);
    app.use(`${prefix}/parent`, parentRoutes_1.default);
    app.use(`${prefix}/notifications`, notificationRoutes_1.default);
    app.use(`${prefix}/chat`, chatRoutes_1.default);
    app.use(`${prefix}/push`, pushRoutes_1.default);
    app.get("/", (_req, res) => res.json({ message: "Server is running!", version: "1.0.0" }));
    app.use((_req, res) => { res.status(404).json({ success: false, error: "NOT_FOUND" }); });
    const handleError = (error, _req, res, _next) => {
        const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" || error instanceof multer_1.default.MulterError || error?.message === 'INVALID_IMAGE_TYPE' ? 400 : 500;
        res.status(status).json({ success: false, error: status === 500 ? "INTERNAL_ERROR" : "INVALID_REQUEST_BODY" });
    };
    app.use(handleError);
    return app;
}

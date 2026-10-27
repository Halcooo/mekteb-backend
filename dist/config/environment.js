"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllowedOrigins = getAllowedOrigins;
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Tests supply isolated configuration and must never load real credentials.
if (process.env.NODE_ENV !== "test") {
    const configuredFile = process.env.MEKTEB_ENV_FILE;
    if (configuredFile && (!path_1.default.isAbsolute(configuredFile) || !fs_1.default.existsSync(configuredFile)))
        throw new Error('MEKTEB_ENV_FILE must name an existing absolute configuration file');
    const envPath = configuredFile ?? path_1.default.resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}`);
    dotenv_1.default.config({
        path: fs_1.default.existsSync(envPath) ? envPath : path_1.default.resolve(process.cwd(), ".env"),
        quiet: true,
    });
}
function getAllowedOrigins() {
    const configured = process.env.FRONTEND_URL?.split(",").map((origin) => origin.trim()).filter(Boolean);
    if (!configured?.length) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("FRONTEND_URL must list the permitted frontend origins");
        }
        return ["http://localhost:5173", "http://127.0.0.1:5173"];
    }
    return configured.map((origin) => {
        const url = new URL(origin);
        if (!["http:", "https:"].includes(url.protocol) ||
            url.username || url.password || url.origin !== origin ||
            (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
            throw new Error("FRONTEND_URL must contain exact origins (HTTPS in production)");
        }
        return url.origin;
    });
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/environment");
const http_1 = require("http");
const app_1 = require("./app");
const notificationHub_1 = require("./services/notificationHub");
const db_1 = __importDefault(require("./db"));
const pushService_1 = require("./services/pushService");
const deployment_1 = require("./config/deployment");
if (process.env.NODE_ENV === 'production')
    (0, deployment_1.assertProductionEnvironment)();
const server = (0, http_1.createServer)((0, app_1.createApp)());
const PORT = process.env.PORT || 5000;
notificationHub_1.NotificationHub.init(server);
const stopPushWorker = (0, pushService_1.startPushWorker)();
server.listen(PORT, () => {
    console.log(`[Startup] Backend listening on port ${PORT}`);
});
server.on("error", (error) => {
    console.error("[Startup] Server failed to start:", error);
    process.exitCode = 1;
});
let shuttingDown = false;
function shutdown() {
    if (shuttingDown)
        return;
    shuttingDown = true;
    notificationHub_1.NotificationHub.close();
    const deadline = setTimeout(() => {
        console.error("[Shutdown] Timed out waiting for active requests");
        process.exit(1);
    }, 10000);
    deadline.unref();
    server.close((error) => {
        if (error) {
            console.error("[Shutdown] HTTP server failed to close:", error);
            process.exitCode = 1;
        }
        void stopPushWorker().then(() => db_1.default.end()).catch((databaseError) => {
            console.error("[Shutdown] Database pool failed to close:", databaseError);
            process.exitCode = 1;
        }).finally(() => clearTimeout(deadline));
    });
}
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

import "./config/environment";
import { createServer } from "http";
import { createApp } from "./app";
import { NotificationHub } from "./services/notificationHub";
import pool from "./db";
import { startPushWorker } from './services/pushService';
import {assertProductionEnvironment} from './config/deployment';

if(process.env.NODE_ENV==='production')assertProductionEnvironment();

const server = createServer(createApp());
const PORT = process.env.PORT || 5000;
NotificationHub.init(server);
const stopPushWorker = startPushWorker();
server.listen(PORT, () => {
  console.log(`[Startup] Backend listening on port ${PORT}`);
});
server.on("error", (error) => {
  console.error("[Startup] Server failed to start:", error);
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  NotificationHub.close();
  const deadline = setTimeout(() => {
    console.error("[Shutdown] Timed out waiting for active requests");
    process.exit(1);
  }, 10_000);
  deadline.unref();
  server.close((error) => {
    if (error) {
      console.error("[Shutdown] HTTP server failed to close:", error);
      process.exitCode = 1;
    }
    void stopPushWorker().then(() => pool.end()).catch((databaseError: unknown) => {
      console.error("[Shutdown] Database pool failed to close:", databaseError);
      process.exitCode = 1;
    }).finally(() => clearTimeout(deadline));
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

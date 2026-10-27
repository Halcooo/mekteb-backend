"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./config/environment");
const db_1 = __importDefault(require("./db"));
const webPush_1 = require("./config/webPush");
const pushService_1 = require("./services/pushService");
const pushRunner_1 = require("./services/pushRunner");
let stopped = false;
process.once('SIGTERM', () => { stopped = true; });
process.once('SIGINT', () => { stopped = true; });
async function main() {
    try {
        if (!(0, webPush_1.getPushConfig)())
            throw new Error('Web Push is not configured');
        const result = await (0, pushRunner_1.runPushPass)(() => pushService_1.PushService.processBatch(), { stopped: () => stopped });
        console.log(`[Push worker] completed batches=${result.batches} claimed=${result.claimed}`);
    }
    finally {
        await db_1.default.end();
    }
}
main().catch(() => { console.error('[Push worker] failed; queued jobs are retained for retry'); process.exitCode = 1; });

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/environment");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const db_1 = __importDefault(require("../db"));
const deployment_1 = require("../config/deployment");
const environment_1 = require("../config/environment");
const webPush_1 = require("../config/webPush");
const jwtService_1 = require("../services/jwtService");
const MigrationSystem_1 = require("../utils/MigrationSystem");
async function main() {
    try {
        process.chdir(node_path_1.default.resolve(__dirname, '../..'));
        if (process.argv.slice(2).some(arg => !['--config-only', '--require-push'].includes(arg)))
            throw new Error('Options: --config-only --require-push');
        const [major, minor] = process.versions.node.split('.').map(Number);
        if (major < 22 || (major === 22 && minor < 14))
            throw new Error('Node.js 22.14 or newer is required');
        (0, deployment_1.assertProductionEnvironment)();
        jwtService_1.JwtService.assertConfiguration();
        (0, environment_1.getAllowedOrigins)();
        const push = (0, webPush_1.getPushConfig)();
        if (process.argv.includes('--require-push') && !push)
            throw new Error('Configure Web Push before the phone test');
        const upload = node_path_1.default.resolve(process.env.UPLOAD_DIRECTORY);
        const withinCode = node_path_1.default.relative(process.cwd(), upload);
        if (!withinCode.startsWith('..' + node_path_1.default.sep) && !node_path_1.default.isAbsolute(withinCode))
            throw new Error('Keep UPLOAD_DIRECTORY outside the application release');
        await promises_1.default.mkdir(upload, { recursive: true, mode: 0o700 });
        const probe = node_path_1.default.join(upload, `.write-check-${(0, node_crypto_1.randomUUID)()}`);
        await promises_1.default.writeFile(probe, 'write check', { flag: 'wx', mode: 0o600 });
        await promises_1.default.unlink(probe);
        console.log(`[Preflight] production configuration valid; push=${push ? 'configured' : 'disabled'}; worker=${process.env.PUSH_WORKER_MODE ?? 'inline'}; upload directory writable`);
        if (process.argv.includes('--config-only'))
            return;
        const [rows] = await db_1.default.query('SELECT VERSION() AS version');
        (0, deployment_1.assertSupportedDatabaseVersion)(String(rows[0].version));
        const status = await new MigrationSystem_1.MigrationSystem(db_1.default).status();
        if (status.pending.length || status.issues.length)
            throw new Error('Database has pending migrations or schema issues; run the reviewed migration procedure');
        const connection = await db_1.default.getConnection();
        try {
            await connection.beginTransaction();
            await connection.query('SELECT id FROM push_deliveries LIMIT 1 FOR UPDATE SKIP LOCKED');
            await connection.rollback();
        }
        finally {
            connection.release();
        }
        console.log(`[Preflight] database ready; migrations=${status.applied.length}; queue locking supported`);
    }
    finally {
        await db_1.default.end();
    }
}
main().catch(error => { console.error(error?.code ? `[Preflight] failed (${error.code})` : error instanceof Error ? error.message : '[Preflight] failed'); process.exitCode = 1; });

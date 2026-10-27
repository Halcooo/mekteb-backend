"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSupportedDatabaseVersion = assertSupportedDatabaseVersion;
exports.assertProductionEnvironment = assertProductionEnvironment;
const node_path_1 = __importDefault(require("node:path"));
function assertSupportedDatabaseVersion(version) {
    if (!(/^8\.\d+\.\d+/.test(version) && !/mariadb/i.test(version)) && !/^10\.11\.\d+-MariaDB(?:\b|[-+])/i.test(version))
        throw new Error('Use a verified MySQL 8 or MariaDB 10.11 server; other versions need a compatibility review');
}
/** No values are included in errors: these may be copied into hosting logs. */
function assertProductionEnvironment(env = process.env) {
    if (env.NODE_ENV !== 'production')
        throw new Error('NODE_ENV must be production for hosting checks');
    for (const key of ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'FRONTEND_URL', 'UPLOAD_DIRECTORY']) {
        if (!env[key]?.trim())
            throw new Error(`Missing production setting: ${key}`);
    }
    if (!/^\d+$/.test(env.DB_PORT ?? '') || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535)
        throw new Error('DB_PORT must be between 1 and 65535');
    if (!node_path_1.default.isAbsolute(env.UPLOAD_DIRECTORY))
        throw new Error('UPLOAD_DIRECTORY must be absolute');
    if (!['inline', 'external'].includes(env.PUSH_WORKER_MODE ?? 'inline'))
        throw new Error('PUSH_WORKER_MODE must be inline or external');
    if (!/^\d+$/.test(env.TRUST_PROXY_HOPS ?? '0') || Number(env.TRUST_PROXY_HOPS ?? 0) > 10)
        throw new Error('Invalid TRUST_PROXY_HOPS');
}

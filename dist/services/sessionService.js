"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionService = exports.SessionError = exports.getSessionLifetimeSeconds = void 0;
const node_crypto_1 = require("node:crypto");
const db_1 = __importDefault(require("../db"));
const jwtService_1 = require("./jwtService");
var jwtService_2 = require("./jwtService");
Object.defineProperty(exports, "getSessionLifetimeSeconds", { enumerable: true, get: function () { return jwtService_2.getSessionLifetimeSeconds; } });
class SessionError extends Error {
    constructor(code, sessionId, userId) {
        super(code === "TOKEN_REUSED" ? "Refresh token reuse detected; sign in again" : "Invalid or expired refresh token");
        this.code = code;
        this.sessionId = sessionId;
        this.userId = userId;
        this.status = 401;
    }
}
exports.SessionError = SessionError;
function validUserId(userId) {
    return Number.isSafeInteger(userId) && userId > 0;
}
function parseRefreshToken(raw) {
    if (typeof raw !== "string" || raw.length !== 80)
        return null;
    const [sessionId, secret, extra] = raw.split(".");
    if (!sessionId || !jwtService_1.SESSION_ID_PATTERN.test(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(secret ?? "") || extra !== undefined)
        return null;
    return { sessionId, hash: jwtService_1.JwtService.hashRefreshToken(raw) };
}
function newRefreshToken(sessionId) {
    return `${sessionId}.${(0, node_crypto_1.randomBytes)(32).toString("base64url")}`;
}
function equalHash(left, right) {
    return /^[a-f0-9]{64}$/.test(left) && /^[a-f0-9]{64}$/.test(right) &&
        (0, node_crypto_1.timingSafeEqual)(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
async function transaction(work) {
    const connection = await db_1.default.getConnection();
    try {
        await connection.beginTransaction();
        const result = await work(connection);
        await connection.commit();
        return result;
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch { /* Preserve the original failure. */ }
        throw error;
    }
    finally {
        connection.release();
    }
}
async function lockSession(connection, sessionId) {
    const [rows] = await connection.execute(`SELECT id, user_id, current_refresh_hash, generation, revoked_at,
            UNIX_TIMESTAMP(expires_at) * 1000 AS expires_at_ms,
            expires_at > CURRENT_TIMESTAMP(3) AS is_unexpired
     FROM auth_sessions WHERE id = ? FOR UPDATE`, [sessionId]);
    return rows[0] ?? null;
}
function isActive(row) {
    return row !== null && row.revoked_at === null && Number(row.is_unexpired) === 1;
}
function credentials(row, refreshToken) {
    return {
        sessionId: row.id,
        userId: row.user_id,
        refreshToken,
        expiresAt: new Date(Number(row.expires_at_ms)),
    };
}
class SessionService {
    static async createSession(userId, metadata = {}) {
        if (!validUserId(userId))
            throw new Error("Invalid user ID for session");
        jwtService_1.JwtService.assertConfiguration();
        const sessionId = (0, node_crypto_1.randomUUID)();
        const refreshToken = newRefreshToken(sessionId);
        const hash = jwtService_1.JwtService.hashRefreshToken(refreshToken);
        const userAgent = typeof metadata.userAgent === "string" ? metadata.userAgent.trim().slice(0, 512) : null;
        return transaction(async (connection) => {
            // Let the database clock calculate expiry; neither driver timezone nor
            // application-node clock differences can extend or shorten the session.
            await connection.execute(`INSERT INTO auth_sessions (id, user_id, current_refresh_hash, user_agent, expires_at)
         VALUES (?, ?, ?, ?, TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(3)))`, [sessionId, userId, hash, userAgent, (0, jwtService_1.getSessionLifetimeSeconds)()]);
            const row = await lockSession(connection, sessionId);
            if (!row)
                throw new Error("Session creation could not be verified");
            return credentials(row, refreshToken);
        });
    }
    static async rotateRefreshToken(raw) {
        const parsed = parseRefreshToken(raw);
        if (!parsed)
            throw new SessionError("INVALID_REFRESH");
        const outcome = await transaction(async (connection) => {
            const row = await lockSession(connection, parsed.sessionId);
            if (!isActive(row))
                throw new SessionError("INVALID_REFRESH");
            if (!equalHash(row.current_refresh_hash, parsed.hash)) {
                const [used] = await connection.execute("SELECT 1 FROM auth_refresh_history WHERE session_id = ? AND refresh_hash = ? LIMIT 1", [row.id, parsed.hash]);
                if (used.length === 0)
                    throw new SessionError("INVALID_REFRESH");
                await connection.execute("UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = 'refresh_reuse' WHERE id = ?", [row.id]);
                // Commit revocation before returning the typed error. Throwing inside
                // the transaction would roll the security action back.
                return { reused: true, sessionId: row.id, userId: row.user_id };
            }
            const refreshToken = newRefreshToken(row.id);
            const newHash = jwtService_1.JwtService.hashRefreshToken(refreshToken);
            await connection.execute("INSERT INTO auth_refresh_history (session_id, refresh_hash, generation) VALUES (?, ?, ?)", [row.id, row.current_refresh_hash, row.generation]);
            await connection.execute(`UPDATE auth_sessions
         SET current_refresh_hash = ?, generation = generation + 1, last_used_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`, [newHash, row.id]);
            return { reused: false, session: credentials(row, refreshToken) };
        });
        if (outcome.reused)
            throw new SessionError("TOKEN_REUSED", outcome.sessionId, outcome.userId);
        return outcome.session;
    }
    // Logout accepts a current or consumed credential, but never a guessed hash.
    static async revokeSessionFromRefresh(raw) {
        const parsed = parseRefreshToken(raw);
        if (!parsed)
            return null;
        return transaction(async (connection) => {
            const row = await lockSession(connection, parsed.sessionId);
            if (!row)
                return null;
            if (!equalHash(row.current_refresh_hash, parsed.hash)) {
                const [used] = await connection.execute("SELECT 1 FROM auth_refresh_history WHERE session_id = ? AND refresh_hash = ? LIMIT 1", [row.id, parsed.hash]);
                if (used.length === 0)
                    return null;
            }
            await connection.execute(`UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3)),
         revoke_reason = COALESCE(revoke_reason, 'logout') WHERE id = ?`, [row.id]);
            return { sessionId: row.id, userId: row.user_id };
        });
    }
    static async revokeSession(sessionId, userId) {
        if (!jwtService_1.SESSION_ID_PATTERN.test(sessionId) || !validUserId(userId))
            return false;
        const [result] = await db_1.default.execute(`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = 'logout'
       WHERE id = ? AND user_id = ? AND revoked_at IS NULL`, [sessionId, userId]);
        return result.affectedRows > 0;
    }
    static async revokeAllForUser(userId) {
        if (!validUserId(userId))
            return 0;
        const [result] = await db_1.default.execute(`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP(3), revoke_reason = 'logout_all'
       WHERE user_id = ? AND revoked_at IS NULL`, [userId]);
        return result.affectedRows;
    }
    static async isSessionActive(sessionId, userId) {
        if (!jwtService_1.SESSION_ID_PATTERN.test(sessionId) || !validUserId(userId))
            return false;
        const [rows] = await db_1.default.execute(`SELECT 1 FROM auth_sessions WHERE id = ? AND user_id = ?
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3) LIMIT 1`, [sessionId, userId]);
        return rows.length > 0;
    }
    static async listActiveForUser(userId) {
        if (!validUserId(userId))
            return [];
        const [rows] = await db_1.default.execute(`SELECT id, user_agent, UNIX_TIMESTAMP(created_at) * 1000 AS created_at_ms,
              UNIX_TIMESTAMP(last_used_at) * 1000 AS last_used_at_ms,
              UNIX_TIMESTAMP(expires_at) * 1000 AS expires_at_ms
       FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP(3)
       ORDER BY created_at DESC, id DESC`, [userId]);
        return rows.map((row) => ({
            sessionId: row.id,
            userAgent: row.user_agent,
            createdAt: new Date(Number(row.created_at_ms)),
            lastUsedAt: new Date(Number(row.last_used_at_ms)),
            expiresAt: new Date(Number(row.expires_at_ms)),
        }));
    }
}
exports.SessionService = SessionService;

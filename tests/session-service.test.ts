import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import jwt from "jsonwebtoken";
import pool from "../src/db";
import { JwtService, getSessionLifetimeSeconds } from "../src/services/jwtService";
import { SessionError, SessionService } from "../src/services/sessionService";

type StoredSession = {
  id: string;
  user_id: number;
  current_refresh_hash: string;
  generation: number;
  user_agent: string | null;
  created_at_ms: number;
  last_used_at_ms: number;
  expires_at_ms: number;
  revoked_at: number | null;
  revoke_reason: string | null;
};
type StoredHistory = { session_id: string; refresh_hash: string; generation: number };

// A transactional in-memory stand-in for the MySQL connection. It exercises
// the real service and SQL parameter boundaries without any network/database.
class TestDatabase {
  sessions = new Map<string, StoredSession>();
  history: StoredHistory[] = [];
  now = Date.UTC(2026, 9, 17, 12);
  calls: Array<{ sql: string; params: unknown[] }> = [];
  commits = 0;
  rollbacks = 0;
  releases = 0;
  acquired = 0;
  failMatching: RegExp | null = null;
  tail = Promise.resolve();

  async connection() {
    this.acquired++;
    let unlock: (() => void) | undefined;
    let backup: { sessions: Map<string, StoredSession>; history: StoredHistory[] } | undefined;
    let started = false;
    return {
      beginTransaction: async () => {
        const previous = this.tail;
        this.tail = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
        started = true;
        backup = { sessions: structuredClone(this.sessions), history: structuredClone(this.history) };
      },
      execute: async (sql: string, params: unknown[]) => {
        assert.equal(started, true, "session SQL must execute inside the transaction");
        return this.execute(sql, params);
      },
      commit: async () => { this.commits++; backup = undefined; unlock?.(); unlock = undefined; },
      rollback: async () => {
        this.rollbacks++;
        if (backup) { this.sessions = backup.sessions; this.history = backup.history; }
        unlock?.(); unlock = undefined;
      },
      release: () => { this.releases++; assert.equal(unlock, undefined, "transaction must finish before release"); },
    };
  }

  async execute(rawSql: string, params: unknown[] = []): Promise<any> {
    const sql = rawSql.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, params: [...params] });
    if (this.failMatching?.test(sql)) { this.failMatching = null; throw new Error("Simulated database failure"); }
    if (sql.startsWith("INSERT INTO auth_sessions")) {
      const [id, userId, hash, agent, lifetime] = params as [string, number, string, string | null, number];
      this.sessions.set(id, { id, user_id: userId, current_refresh_hash: hash, generation: 0,
        user_agent: agent, created_at_ms: this.now, last_used_at_ms: this.now,
        expires_at_ms: this.now + lifetime * 1000, revoked_at: null, revoke_reason: null });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes("FROM auth_sessions WHERE id = ? FOR UPDATE")) {
      const row = this.sessions.get(String(params[0]));
      return [row ? [{ ...row, is_unexpired: Number(row.expires_at_ms > this.now) }] : [], []];
    }
    if (sql.startsWith("SELECT 1 FROM auth_refresh_history")) {
      return [this.history.filter((row) => row.session_id === params[0] && row.refresh_hash === params[1]).map(() => ({ exists: 1 })), []];
    }
    if (sql.startsWith("INSERT INTO auth_refresh_history")) {
      const [session_id, refresh_hash, generation] = params as [string, string, number];
      assert.equal(this.history.some((row) => row.session_id === session_id && row.generation === generation), false);
      this.history.push({ session_id, refresh_hash, generation });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith("UPDATE auth_sessions SET current_refresh_hash")) {
      const row = this.sessions.get(String(params[1]))!;
      row.current_refresh_hash = String(params[0]); row.generation++; row.last_used_at_ms = this.now;
      return [{ affectedRows: 1 }, []];
    }
    if (sql.startsWith("UPDATE auth_sessions SET revoked_at")) {
      let affectedRows = 0;
      for (const row of this.sessions.values()) {
        const matchingId = !sql.includes("WHERE id = ?") || row.id === params[0];
        const matchingUser = !sql.includes("user_id = ?") || row.user_id === params[sql.includes("WHERE id = ?") ? 1 : 0];
        const matchingActive = !sql.includes("AND revoked_at IS NULL") || row.revoked_at === null;
        if (matchingId && matchingUser && matchingActive) {
          row.revoked_at ??= this.now;
          row.revoke_reason ??= sql.includes("'refresh_reuse'") ? "refresh_reuse" : sql.includes("'logout_all'") ? "logout_all" : "logout";
          affectedRows++;
        }
      }
      return [{ affectedRows }, []];
    }
    if (sql.startsWith("SELECT 1 FROM auth_sessions")) {
      const row = this.sessions.get(String(params[0]));
      return [row && row.user_id === params[1] && row.revoked_at === null && row.expires_at_ms > this.now ? [{ exists: 1 }] : [], []];
    }
    if (sql.startsWith("SELECT id, user_agent")) {
      return [[...this.sessions.values()].filter((row) => row.user_id === params[0] && row.revoked_at === null && row.expires_at_ms > this.now), []];
    }
    throw new Error(`Unexpected SQL in isolated test: ${sql}`);
  }
}

let database: TestDatabase;
const envNames = ["JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRE", "JWT_REFRESH_EXPIRE"] as const;
const initialEnvironment = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));

beforeEach(() => {
  database = new TestDatabase();
  mock.method(pool, "getConnection", (() => database.connection()) as any);
  mock.method(pool, "execute", ((sql: string, params: unknown[]) => database.execute(sql, params)) as any);
  mock.method(pool, "query", async () => { throw new Error("Unexpected database query"); });
});
afterEach(() => {
  mock.restoreAll();
  for (const name of envNames) {
    if (initialEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = initialEnvironment[name];
  }
});

function errorCode(code: "INVALID_REFRESH" | "TOKEN_REUSED") {
  return (error: unknown) => error instanceof SessionError && error.code === code && error.status === 401;
}

test("login creates independent device sessions and persists only keyed refresh digests", async () => {
  const first = await SessionService.createSession(7, { userAgent: "Browser" });
  const second = await SessionService.createSession(7);
  assert.notEqual(first.sessionId, second.sessionId);
  assert.notEqual(first.refreshToken, second.refreshToken);
  assert.equal(first.refreshToken.length, 80);
  assert.equal(first.refreshToken.split(".")[0], first.sessionId);
  assert.equal(first.expiresAt.getTime(), database.now + 30 * 86400000);
  assert.equal(database.sessions.get(first.sessionId)?.current_refresh_hash, JwtService.hashRefreshToken(first.refreshToken));
  assert.equal(database.sessions.get(first.sessionId)?.user_agent, "Browser");
  const persisted = JSON.stringify(database.calls);
  assert.equal(persisted.includes(first.refreshToken), false);
  assert.equal(persisted.includes(second.refreshToken), false);
  assert.equal(database.commits, 2);
  assert.equal(database.releases, 2);
});

test("rotation consumes the old hash atomically and never extends absolute expiry", async () => {
  const first = await SessionService.createSession(7);
  database.now += 86400000;
  const second = await SessionService.rotateRefreshToken(first.refreshToken);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.userId, 7);
  assert.notEqual(second.refreshToken, first.refreshToken);
  assert.equal(second.expiresAt.getTime(), first.expiresAt.getTime());
  assert.deepEqual(database.history, [{ session_id: first.sessionId, refresh_hash: JwtService.hashRefreshToken(first.refreshToken), generation: 0 }]);
  assert.equal(database.sessions.get(first.sessionId)?.generation, 1);
  assert.equal(database.sessions.get(first.sessionId)?.current_refresh_hash, JwtService.hashRefreshToken(second.refreshToken));
  assert.equal(JSON.stringify(database.calls).includes(second.refreshToken), false);
});

test("known consumed-token replay commits family revocation and invalidates the latest credential", async () => {
  const first = await SessionService.createSession(7);
  const second = await SessionService.rotateRefreshToken(first.refreshToken);
  await assert.rejects(SessionService.rotateRefreshToken(first.refreshToken), (error: unknown) => {
    assert.ok(error instanceof SessionError);
    assert.equal(error.code, "TOKEN_REUSED");
    assert.equal(error.sessionId, first.sessionId);
    assert.equal(error.userId, 7);
    return true;
  });
  assert.equal(database.sessions.get(first.sessionId)?.revoke_reason, "refresh_reuse");
  assert.equal(database.commits, 3, "reuse revocation must commit rather than roll back");
  assert.equal(await SessionService.isSessionActive(first.sessionId, 7), false);
  await assert.rejects(SessionService.rotateRefreshToken(second.refreshToken), errorCode("INVALID_REFRESH"));
});

test("unknown fake secrets and token components from another device never revoke a valid session", async () => {
  const first = await SessionService.createSession(7);
  const other = await SessionService.createSession(8);
  for (const secret of ["A".repeat(43), other.refreshToken.split(".")[1]]) {
    const fake = `${first.sessionId}.${secret}`;
    await assert.rejects(SessionService.rotateRefreshToken(fake), errorCode("INVALID_REFRESH"));
    assert.equal(await SessionService.revokeSessionFromRefresh(fake), null);
  }
  assert.equal(await SessionService.isSessionActive(first.sessionId, 7), true);
  assert.equal(database.sessions.get(first.sessionId)?.revoked_at, null);
  assert.equal(database.history.length, 0);
  await SessionService.rotateRefreshToken(first.refreshToken);
});

test("malformed refresh tokens are rejected without opening a database connection", async () => {
  for (const raw of ["", "legacy.jwt.token", "x".repeat(4096), `${"a".repeat(36)}.${"B".repeat(43)}`, undefined, {}, 42]) {
    await assert.rejects(SessionService.rotateRefreshToken(raw as string), errorCode("INVALID_REFRESH"));
    assert.equal(await SessionService.revokeSessionFromRefresh(raw as string), null);
  }
  assert.equal(database.acquired, 0);
});

test("expiry and explicit logout reject refresh and access-session checks", async () => {
  const expired = await SessionService.createSession(7);
  const revoked = await SessionService.createSession(8);
  assert.equal(await SessionService.revokeSession(revoked.sessionId, 8), true);
  database.now = expired.expiresAt.getTime();
  for (const session of [expired, revoked]) {
    assert.equal(await SessionService.isSessionActive(session.sessionId, session.userId), false);
    await assert.rejects(SessionService.rotateRefreshToken(session.refreshToken), errorCode("INVALID_REFRESH"));
  }
  assert.equal(database.history.length, 0);
});

test("strict concurrent refresh serializes on the session lock and treats the second use as replay", async () => {
  const initial = await SessionService.createSession(7);
  const results = await Promise.allSettled([
    SessionService.rotateRefreshToken(initial.refreshToken),
    SessionService.rotateRefreshToken(initial.refreshToken),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.equal(errorCode("TOKEN_REUSED")(rejected.reason), true);
  assert.equal(database.history.length, 1);
  assert.equal(await SessionService.isSessionActive(initial.sessionId, 7), false);
  assert.equal(database.releases, 3);
});

test("failed rotation rolls back both digest changes and consumed history, preserving retry of the original credential", async () => {
  const initial = await SessionService.createSession(7);
  const originalHash = database.sessions.get(initial.sessionId)?.current_refresh_hash;
  database.failMatching = /^UPDATE auth_sessions SET current_refresh_hash/;
  await assert.rejects(SessionService.rotateRefreshToken(initial.refreshToken), /Simulated database failure/);
  assert.equal(database.history.length, 0);
  assert.equal(database.sessions.get(initial.sessionId)?.current_refresh_hash, originalHash);
  assert.equal(database.sessions.get(initial.sessionId)?.generation, 0);
  assert.equal(database.rollbacks, 1);
  assert.equal(database.releases, 2);
  await SessionService.rotateRefreshToken(initial.refreshToken);
});

test("database availability failures propagate instead of becoming an invalid-token verdict", async () => {
  mock.method(pool, "getConnection", async () => { throw new Error("Database unavailable"); });
  await assert.rejects(SessionService.createSession(7), /Database unavailable/);
  const raw = `11111111-1111-4111-8111-111111111111.${"B".repeat(43)}`;
  await assert.rejects(SessionService.rotateRefreshToken(raw), (error: unknown) => error instanceof Error && !(error instanceof SessionError) && error.message === "Database unavailable");
});

test("logout with current or consumed refresh identifies and revokes the family without trusting token sessionId alone", async () => {
  const initial = await SessionService.createSession(7);
  await SessionService.rotateRefreshToken(initial.refreshToken);
  assert.deepEqual(await SessionService.revokeSessionFromRefresh(initial.refreshToken), { sessionId: initial.sessionId, userId: 7 });
  assert.equal(await SessionService.isSessionActive(initial.sessionId, 7), false);
  assert.deepEqual(await SessionService.revokeSessionFromRefresh(initial.refreshToken), { sessionId: initial.sessionId, userId: 7 });
  const current = await SessionService.createSession(7);
  await SessionService.revokeSessionFromRefresh(current.refreshToken);
  assert.equal(await SessionService.isSessionActive(current.sessionId, 7), false);
});

test("session listing and revocation are owner-scoped and never disclose token hashes", async () => {
  const first = await SessionService.createSession(7);
  const second = await SessionService.createSession(7);
  const other = await SessionService.createSession(8);
  assert.equal(await SessionService.revokeSession(first.sessionId, 8), false);
  assert.equal(await SessionService.isSessionActive(first.sessionId, 8), false);
  const active = await SessionService.listActiveForUser(7);
  assert.deepEqual(active.map((session) => session.sessionId).sort(), [first.sessionId, second.sessionId].sort());
  assert.deepEqual(Object.keys(active[0]).sort(), ["sessionId", "userAgent", "createdAt", "lastUsedAt", "expiresAt"].sort());
  assert.equal(await SessionService.revokeAllForUser(7), 2);
  assert.deepEqual(await SessionService.listActiveForUser(7), []);
  assert.equal(await SessionService.isSessionActive(other.sessionId, 8), true);
});

test("access JWTs require a persisted-session identifier and have independent unique token IDs", async () => {
  const session = await SessionService.createSession(7);
  const input = { userId: 7, username: "test", email: "test@example.invalid", role: "parent", sid: session.sessionId };
  const one = JwtService.generateAccessToken(input);
  const two = JwtService.generateAccessToken(input);
  const first = JwtService.verifyAccessToken(one)!;
  const second = JwtService.verifyAccessToken(two)!;
  assert.equal(first.sid, session.sessionId);
  assert.notEqual(first.jti, second.jti);
  assert.notEqual(one, two);
  assert.equal(JwtService.verifyAccessToken(session.refreshToken), null);
  for (const invalid of [{ sid: undefined }, { sid: "not-a-session" }, { jti: undefined }, { jti: "not-a-token-id" }, { tokenType: "refresh" }]) {
    const raw = jwt.sign({ ...input, jti: first.jti, tokenType: "access", ...invalid }, process.env.JWT_SECRET!, {
      algorithm: "HS256", issuer: "mekteb-app", audience: "mekteb-users", expiresIn: "15m",
    });
    assert.equal(JwtService.verifyAccessToken(raw), null);
  }
});

test("session and access lifetimes are bounded and refresh hashing uses a separate required secret", () => {
  assert.equal(getSessionLifetimeSeconds(), 30 * 86400);
  process.env.JWT_REFRESH_EXPIRE = "2d";
  assert.equal(getSessionLifetimeSeconds(), 2 * 86400);
  process.env.JWT_EXPIRE = "7d";
  assert.throws(() => JwtService.assertConfiguration(), /positive duration/);
  process.env.JWT_EXPIRE = "15m";
  process.env.JWT_REFRESH_EXPIRE = "366d";
  assert.throws(() => JwtService.assertConfiguration(), /positive duration/);
  process.env.JWT_REFRESH_EXPIRE = "30d";
  process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
  assert.throws(() => JwtService.assertConfiguration(), /different secrets/);
});

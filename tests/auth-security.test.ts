import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import attendanceRoutes from "../src/routes/attendanceRoutes";
import { AuthController } from "../src/controllers/authController";
import { authenticateToken, requireRole } from "../src/middleware/authMiddleware";
import { AttendanceService } from "../src/services/attendanceService";
import { AuthService, type AuthResult } from "../src/services/authService";
import { JwtService } from "../src/services/jwtService";
import { UserService, toPublicUser, type User, type CreateUserData } from "../src/services/userService";
import { SessionService, SessionError, type SessionCredentials } from "../src/services/sessionService";
import { NotificationHub } from "../src/services/notificationHub";
import pool from "../src/db";

const envNames = ["JWT_SECRET", "JWT_REFRESH_SECRET", "JWT_EXPIRE", "JWT_REFRESH_EXPIRE"] as const;
const initialEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const sessionId = "11111111-1111-4111-8111-111111111111";
const tokenId = "22222222-2222-4222-8222-222222222222";
const tokenPayload = { userId: 1, username: "test-user", email: "test@example.test", role: "admin", sid: sessionId };
const refreshToken = `${sessionId}.${"A".repeat(43)}`;
const userRow = {
  id: 1, username: "test-user", email: "test@example.test", role: "admin",
  first_name: "Test", last_name: "User", password: "private-password-hash",
  internal_secret: "must-not-appear-in-responses", created_at: new Date("2026-01-01T00:00:00Z"),
} as User;

function credentials(): SessionCredentials {
  return { sessionId, userId: 1, refreshToken, expiresAt: new Date(Date.now() + 30 * 86400000) };
}

function authenticationResult(): AuthResult {
  return { success: true, ...credentials(), user: toPublicUser(userRow), accessToken: JwtService.generateAccessToken(tokenPayload) };
}

function restoreEnvironment() {
  for (const name of envNames) {
    if (initialEnv[name] === undefined) delete process.env[name];
    else process.env[name] = initialEnv[name];
  }
}

beforeEach(() => {
  restoreEnvironment();
  for (const method of ["query", "execute", "getConnection"] as const) {
    mock.method(pool, method, async () => { throw new Error("Unexpected database access in auth security test"); });
  }
  mock.method(SessionService, "isSessionActive", async () => true);
  mock.method(NotificationHub, "disconnectSession", () => {});
  mock.method(NotificationHub, "disconnectUser", () => {});
});
afterEach(() => { mock.restoreAll(); restoreEnvironment(); });

type RequestApi = (path: string, token?: string, method?: string, body?: unknown, cookie?: string) => Promise<{ status: number; body: any; headers: Headers }>;
async function withApi(run: (request: RequestApi) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/attendance", attendanceRoutes);
  app.get("/private", authenticateToken, requireRole("admin"), (req, res) => res.json(req.user));
  // Exercise controller validation directly; rate limiting is a separate concern.
  const authRouter = express.Router();
  authRouter.post("/register", AuthController.register);
  authRouter.post("/login", AuthController.login);
  authRouter.post("/refresh", AuthController.refreshToken);
  authRouter.post("/logout", AuthController.logout);
  authRouter.post("/logout-all", authenticateToken, AuthController.logoutAll);
  authRouter.get("/sessions", authenticateToken, AuthController.listSessions);
  authRouter.delete("/sessions/:id", authenticateToken, AuthController.revokeSession);
  app.use("/auth", authRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(async (path, token, method = "GET", body, cookie) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", "User-Agent": "SecurityTest/1.0" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json(), headers: response.headers };
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const attendanceEndpoints = [
  ["GET", "/attendance"], ["GET", "/attendance/1"],
  ["GET", "/attendance/student/10"], ["GET", "/attendance/student/10/stats"],
  ["GET", "/attendance/date/2026-10-17"], ["GET", "/attendance/date/2026-10-17/summary"],
  ["GET", "/attendance/grade/1"], ["POST", "/attendance"],
  ["POST", "/attendance/bulk"], ["PUT", "/attendance/1"], ["DELETE", "/attendance/1"],
];

test("every attendance read and write endpoint rejects anonymous access", async () => {
  const lookup = mock.method(UserService, "getUserById", async () => userRow);
  await withApi(async (request) => {
    for (const [method, path] of attendanceEndpoints) {
      assert.equal((await request(path, undefined, method, method === "POST" || method === "PUT" ? {} : undefined)).status, 401, `${method} ${path}`);
    }
    assert.equal(lookup.mock.callCount(), 0);
  });
});

test("attendance requires the current account to be admin, including writes", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  for (const role of ["parent", "teacher", "user"]) {
    const lookup = mock.method(UserService, "getUserById", async () => ({ ...userRow, role }));
    await withApi(async (request) => {
      for (const [method, path] of attendanceEndpoints) {
        assert.equal((await request(path, token, method, method === "POST" || method === "PUT" ? {} : undefined)).status, 403, `${role} ${method} ${path}`);
      }
    });
    lookup.mock.restore();
  }
});

test("admins reach real attendance handlers and authenticated responses cannot be cached", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  mock.method(UserService, "getUserById", async () => userRow);
  const record = { id: 1, student_id: 10, date: "2026-10-17", status: "PRESENT" };
  const list = mock.method(AttendanceService, "getAllAttendance", async () => [record]);
  const create = mock.method(AttendanceService, "createAttendance", async () => record);
  await withApi(async (request) => {
    const response = await request("/attendance?date=2026-10-17", token);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(response.body.data, [record]);
    assert.deepEqual(list.mock.calls[0].arguments, ["2026-10-17"]);
    const created = await request("/attendance", token, "POST", { student_id: 10, date: "2026-10-17", status: "PRESENT" });
    assert.equal(created.status, 201);
    assert.equal(create.mock.callCount(), 1);
  });
});

test("attendance rejects partial IDs, missing bodies and invalid bulk records before any database work", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  mock.method(UserService, "getUserById", async () => userRow);
  await withApi(async (request) => {
    for (const id of ["0", "-1", "1tail", "1.5", "9007199254740992"]) {
      for (const [method, path] of [
        ["GET", `/attendance/${id}`], ["PUT", `/attendance/${id}`], ["DELETE", `/attendance/${id}`],
        ["GET", `/attendance/student/${id}`], ["GET", `/attendance/student/${id}/stats`],
      ]) {
        assert.equal((await request(path, token, method, method === "PUT" ? { status: "PRESENT" } : undefined)).status, 400, `${method} ${path}`);
      }
    }
    for (const [method, path] of [["POST", "/attendance"], ["POST", "/attendance/bulk"], ["PUT", "/attendance/1"]]) {
      assert.equal((await request(path, token, method)).status, 400);
    }
    for (const student_id of ["10", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await request("/attendance", token, "POST", { student_id, date: "2026-10-17", status: "PRESENT" })).status, 400);
    }
    for (const attendanceList of [null, {}, [], [null], ["invalid"], [{ student_id: 1.5, date: "2026-10-17", status: "PRESENT" }], Array(1001).fill({})]) {
      assert.equal((await request("/attendance/bulk", token, "POST", { attendanceList })).status, 400);
    }
  });
});

test("authentication rejects deleted users and stale admin claims, and fails closed when lookup is unavailable", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  const lookup = mock.method(UserService, "getUserById", async () => null);
  await withApi(async (request) => {
    assert.equal((await request("/private", token)).status, 401);
    lookup.mock.mockImplementation(async () => ({ ...userRow, role: "parent" }));
    assert.equal((await request("/private", token)).status, 403);
    lookup.mock.mockImplementation(async () => { throw new Error("Simulated database outage"); });
    const unavailable = await request("/private", token);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error, "AUTHENTICATION_UNAVAILABLE");
  });
});

test("revoked sessions are rejected before user lookup, and session-store outages return 503", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  const active = mock.method(SessionService, "isSessionActive", async () => false);
  const lookup = mock.method(UserService, "getUserById", async () => userRow);
  await withApi(async (request) => {
    const revoked = await request("/private", token);
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body.error, "SESSION_REVOKED");
    assert.deepEqual(active.mock.calls[0].arguments, [sessionId, 1]);
    assert.equal(lookup.mock.callCount(), 0);
    active.mock.mockImplementation(async () => { throw new Error("Database unavailable"); });
    assert.equal((await request("/private", token)).status, 503);
    assert.equal(lookup.mock.callCount(), 0);
  });
});

function signAccess(payload: Record<string, unknown> = {}, options: jwt.SignOptions = {}) {
  const signingOptions = Object.fromEntries(Object.entries({
    algorithm: "HS256", issuer: "mekteb-app", audience: "mekteb-users", expiresIn: "15m", ...options,
  }).filter(([, value]) => value !== undefined)) as jwt.SignOptions;
  return jwt.sign({ ...tokenPayload, jti: tokenId, tokenType: "access", ...payload }, process.env.JWT_SECRET!, signingOptions);
}

test("JWT verification requires the configured issuer, audience, signature, algorithm and expiry", () => {
  assert.equal(JwtService.verifyAccessToken(signAccess())?.userId, 1);
  for (const options of [
    { issuer: undefined }, { issuer: "another-app" }, { audience: undefined },
    { audience: "another-audience" }, { algorithm: "HS512" }, { expiresIn: -1 }, { expiresIn: undefined },
  ] as jwt.SignOptions[]) {
    assert.equal(JwtService.verifyAccessToken(signAccess({}, options)), null);
  }
  const wrongSignature = jwt.sign({ ...tokenPayload, tokenType: "access" }, process.env.JWT_REFRESH_SECRET!, {
    issuer: "mekteb-app", audience: "mekteb-users", expiresIn: "15m",
  });
  assert.equal(JwtService.verifyAccessToken(wrongSignature), null);
  assert.equal(JwtService.verifyAccessToken("not-a-jwt"), null);
});

test("JWT verification requires access type, valid identity and durable session claims", () => {
  for (const userId of [undefined, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(JwtService.verifyAccessToken(signAccess({ userId })), null);
  }
  for (const tokenType of [undefined, "refresh", "unexpected"]) assert.equal(JwtService.verifyAccessToken(signAccess({ tokenType })), null);
  for (const field of ["username", "email", "role"]) assert.equal(JwtService.verifyAccessToken(signAccess({ [field]: 123 })), null);
  for (const field of ["sid", "jti"]) {
    for (const value of [undefined, "", 123, "not-a-session-id"]) assert.equal(JwtService.verifyAccessToken(signAccess({ [field]: value })), null);
  }
  const legacyRefresh = jwt.sign({ userId: 1, tokenType: "refresh" }, process.env.JWT_REFRESH_SECRET!, {
    issuer: "mekteb-app", audience: "mekteb-users", expiresIn: "30d",
  });
  assert.equal(JwtService.verifyAccessToken(legacyRefresh), null);
  assert.equal(JwtService.verifyAccessToken(refreshToken), null);
});

test("new access tokens default to fifteen minutes and explicit token type", () => {
  delete process.env.JWT_EXPIRE;
  const token = JwtService.generateAccessToken(tokenPayload);
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  assert.equal(decoded.exp! - decoded.iat!, 15 * 60);
  assert.equal(decoded.tokenType, "access");
  assert.equal(decoded.iss, "mekteb-app");
  assert.equal(decoded.aud, "mekteb-users");
});

test("JWT configuration fails closed for missing, weak, equal or placeholder secrets and invalid lifetimes", () => {
  assert.doesNotThrow(() => JwtService.assertConfiguration());
  for (const name of ["JWT_SECRET", "JWT_REFRESH_SECRET"] as const) {
    for (const value of [undefined, "short", "fallback-secret-that-is-deliberately-long-enough"]) {
      restoreEnvironment();
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
      assert.throws(() => JwtService.assertConfiguration(), /secret/i);
    }
  }
  restoreEnvironment();
  process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
  assert.throws(() => JwtService.assertConfiguration(), /different secrets/);
  for (const name of ["JWT_EXPIRE", "JWT_REFRESH_EXPIRE"] as const) {
    for (const value of ["", "0m", "-1m", "900", "forever"]) {
      restoreEnvironment();
      process.env[name] = value;
      assert.throws(() => JwtService.assertConfiguration(), /positive duration/);
    }
  }
});

test("registration rejects invalid types, empty names and bcrypt-truncated passwords before invoking services", async () => {
  const registration = mock.method(AuthService, "register", async () => authenticationResult());
  const valid = { firstName: "Test", lastName: "User", username: "test-user", email: "test@example.test", password: "secure-password-123" };
  const invalid = [
    {}, { ...valid, firstName: 123 }, { ...valid, lastName: [] }, { ...valid, username: {} },
    { ...valid, firstName: " " }, { ...valid, username: "a".repeat(101) }, { ...valid, email: "not-an-email" },
    { ...valid, email: "x".repeat(255) }, { ...valid, password: 123 }, { ...valid, password: "short" },
    { ...valid, password: "a".repeat(73) }, { ...valid, password: "é".repeat(37) },
  ];
  await withApi(async (request) => {
    for (const body of invalid) assert.equal((await request("/auth/register", undefined, "POST", body)).status, 400);
    assert.equal(registration.mock.callCount(), 0);
  });
});

test("login validates input while refresh accepts only a single bounded cookie, never body credentials", async () => {
  const login = mock.method(AuthService, "login", async () => authenticationResult());
  const refresh = mock.method(AuthService, "refreshToken", async () => authenticationResult());
  await withApi(async (request) => {
    for (const body of [{}, { username: 12, password: "password" }, { username: " ", password: "password" }, { username: "a".repeat(101), password: "password" }, { username: "test", password: [] }, { username: "test", password: "" }, { username: "test", password: "é".repeat(2049) }]) {
      assert.equal((await request("/auth/login", undefined, "POST", body)).status, 400);
    }
    for (const bodyToken of [undefined, null, [], {}, 123, "", refreshToken]) {
      assert.equal((await request("/auth/refresh", undefined, "POST", { refreshToken: bodyToken })).status, 401);
    }
    for (const cookie of ["mekteb_refresh=", `mekteb_refresh=${"a".repeat(257)}`, "mekteb_refresh=%XX", `mekteb_refresh=${refreshToken}; mekteb_refresh=duplicate`]) {
      assert.equal((await request("/auth/refresh", undefined, "POST", {}, cookie)).status, 401);
    }
    assert.equal(login.mock.callCount(), 0);
    assert.equal(refresh.mock.callCount(), 0);
    assert.equal((await request("/auth/login", undefined, "POST", { username: " test ", password: "legacy" })).status, 200);
    assert.deepEqual(login.mock.calls[0].arguments, [{ username: "test", password: "legacy" }, "SecurityTest/1.0"]);
    assert.equal((await request("/auth/login", undefined, "POST", { username: "test", password: "a".repeat(80) })).status, 200);
    const refreshed = await request("/auth/refresh", undefined, "POST", { refreshToken: "ignored" }, `mekteb_refresh=${refreshToken}`);
    assert.equal(refreshed.status, 200);
    assert.deepEqual(refresh.mock.calls[0].arguments, [refreshToken]);
    assert.equal(refreshed.body.refreshToken, undefined);
    assert.match(refreshed.headers.get("set-cookie") ?? "", /HttpOnly/);
  });
});

function assertSafeUser(value: Record<string, unknown>) {
  assert.deepEqual(Object.keys(value).sort(), ["id", "username", "email", "role", "first_name", "last_name", "created_at"].sort());
}

test("real register/login/refresh services return only the allowlisted user DTO and registration cannot choose admin", async () => {
  mock.method(AuthService, "hashPassword", async () => "test-hash");
  mock.method(AuthService, "comparePassword", async () => true);
  mock.method(UserService, "getUserByEmail", async () => null);
  const usernameLookup = mock.method(UserService, "getUserByUsername", async () => null);
  const create = mock.method(UserService, "createUser", async (_data: CreateUserData) => ({ ...userRow, role: "parent" }));
  mock.method(UserService, "getUserById", async () => userRow);
  const createSession = mock.method(SessionService, "createSession", async () => credentials());
  const rotate = mock.method(SessionService, "rotateRefreshToken", async () => ({ ...credentials(), refreshToken: `${sessionId}.${"B".repeat(43)}` }));
  await withApi(async (request) => {
    const registered = await request("/auth/register", undefined, "POST", {
      firstName: " Test ", lastName: " User ", username: " test-user ", email: " test@example.test ", password: "secure-password-123", role: "admin",
    });
    assert.equal(registered.status, 201);
    assertSafeUser(registered.body.user);
    assert.equal(registered.body.user.role, "parent");
    const createdUser = create.mock.calls[0]?.arguments[0];
    assert.ok(createdUser);
    assert.equal(createdUser.role, "parent");
    assert.equal(createdUser.first_name, "Test");
    assert.equal(registered.body.refreshToken, undefined);
    assert.match(registered.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.deepEqual(createSession.mock.calls[0].arguments, [1, { userAgent: "SecurityTest/1.0" }]);
    usernameLookup.mock.mockImplementation(async () => userRow);
    const loggedIn = await request("/auth/login", undefined, "POST", { username: "test-user", password: "legacy" });
    assert.equal(loggedIn.status, 200);
    assertSafeUser(loggedIn.body.user);
    assert.equal(JwtService.verifyAccessToken(loggedIn.body.accessToken)?.userId, 1);
    assert.equal(loggedIn.body.refreshToken, undefined);
    assert.equal(JwtService.verifyAccessToken(loggedIn.body.accessToken)?.sid, sessionId);
    const cookie = loggedIn.headers.get("set-cookie")!.split(";")[0];
    const refreshed = await request("/auth/refresh", undefined, "POST", {}, cookie);
    assert.equal(refreshed.status, 200);
    assertSafeUser(refreshed.body.user);
    assert.equal(JwtService.verifyAccessToken(refreshed.body.accessToken)?.userId, 1);
    assert.equal(refreshed.body.refreshToken, undefined);
    assert.deepEqual(rotate.mock.calls[0].arguments, [refreshToken]);
    assert.notEqual(refreshed.headers.get("set-cookie")!.split(";")[0], cookie);
  });
});

test("refresh replay clears its cookie and disconnects its session, while database errors preserve the cookie", async () => {
  const refresh = mock.method(AuthService, "refreshToken", async () => { throw new SessionError("TOKEN_REUSED", sessionId, 1); });
  const disconnect = mock.method(NotificationHub, "disconnectSession", () => {});
  await withApi(async (request) => {
    const reused = await request("/auth/refresh", undefined, "POST", {}, `mekteb_refresh=${refreshToken}`);
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error, "TOKEN_REUSED");
    assert.match(reused.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
    assert.deepEqual(disconnect.mock.calls[0].arguments, [sessionId]);
    refresh.mock.mockImplementation(async () => { throw new Error("private SQL database details"); });
    const unavailable = await request("/auth/refresh", undefined, "POST", {}, `mekteb_refresh=${refreshToken}`);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.error, "AUTHENTICATION_UNAVAILABLE");
    assert.equal(unavailable.headers.get("set-cookie"), null);
    assert.equal(JSON.stringify(unavailable.body).includes("SQL"), false);
    assert.equal(disconnect.mock.callCount(), 1);
  });
});

test("logout revokes the cookie session and login replacement closes the previous session", async () => {
  const revoked = { sessionId: "33333333-3333-4333-8333-333333333333", userId: 2 };
  const revoke = mock.method(SessionService, "revokeSessionFromRefresh", async () => revoked);
  const disconnect = mock.method(NotificationHub, "disconnectSession", () => {});
  mock.method(AuthService, "login", async () => authenticationResult());
  const previousCookie = `mekteb_refresh=${revoked.sessionId}.${"C".repeat(43)}`;
  await withApi(async (request) => {
    const loggedOut = await request("/auth/logout", undefined, "POST", {}, previousCookie);
    assert.equal(loggedOut.status, 200);
    assert.match(loggedOut.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
    assert.equal(revoke.mock.callCount(), 1);
    const loggedIn = await request("/auth/login", undefined, "POST", { username: "test-user", password: "legacy" }, previousCookie);
    assert.equal(loggedIn.status, 200);
    assert.equal(revoke.mock.callCount(), 2);
    assert.deepEqual(disconnect.mock.calls.map((call) => call.arguments), [[revoked.sessionId], [revoked.sessionId]]);
    assert.equal(loggedIn.body.refreshToken, undefined);
  });
});

test("session management scopes listing, logout-all and individual revocation to the authenticated user", async () => {
  const token = JwtService.generateAccessToken(tokenPayload);
  mock.method(UserService, "getUserById", async () => userRow);
  const list = mock.method(SessionService, "listActiveForUser", async () => [{
    sessionId, userAgent: "Browser", createdAt: new Date(), lastUsedAt: new Date(), expiresAt: credentials().expiresAt,
  }]);
  const all = mock.method(SessionService, "revokeAllForUser", async () => 2);
  const one = mock.method(SessionService, "revokeSession", async () => false);
  const disconnectUser = mock.method(NotificationHub, "disconnectUser", () => {});
  await withApi(async (request) => {
    assert.equal((await request("/auth/sessions")).status, 401);
    assert.equal((await request("/auth/logout-all", undefined, "POST")).status, 401);
    const sessions = await request("/auth/sessions", token);
    assert.equal(sessions.status, 200);
    assert.equal(sessions.body.sessions[0].current, true);
    assert.deepEqual(list.mock.calls[0].arguments, [1]);
    assert.equal((await request("/auth/sessions/invalid", token, "DELETE")).status, 400);
    assert.equal(one.mock.callCount(), 0);
    assert.equal((await request(`/auth/sessions/${sessionId}`, token, "DELETE")).status, 404);
    assert.deepEqual(one.mock.calls[0].arguments, [sessionId, 1]);
    one.mock.mockImplementation(async () => true);
    const removed = await request(`/auth/sessions/${sessionId}`, token, "DELETE");
    assert.equal(removed.status, 200);
    assert.match(removed.headers.get("set-cookie") ?? "", /Expires=Thu, 01 Jan 1970/);
    const loggedOut = await request("/auth/logout-all", token, "POST");
    assert.equal(loggedOut.status, 200);
    assert.deepEqual(all.mock.calls[0].arguments, [1]);
    assert.deepEqual(disconnectUser.mock.calls[0].arguments, [1]);
  });
});

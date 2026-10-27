import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { AuthService } from "../src/services/authService";
import { SessionService, SessionError } from "../src/services/sessionService";
import { JwtService } from "../src/services/jwtService";
import { UserService } from "../src/services/userService";
import { NotificationHub } from "../src/services/notificationHub";
import pool from "../src/db";

const sid = "66f8a6e9-4ff2-49c1-8b2c-e2df950f4390";
const user = { id: 42, username: "cookie-test", email: "cookie@example.test", role: "parent", first_name: "Test", last_name: "Parent", created_at: new Date(), password: "private" };
const input = { userId: user.id, username: user.username, email: user.email, role: user.role, sid };
const credentials = () => ({ success: true, user, accessToken: JwtService.generateAccessToken(input), sessionId: sid, refreshToken: `${sid}.${"a".repeat(43)}`, expiresAt: new Date(Date.now() + 86400_000) });
const csrf = { Origin: "http://localhost:5173", "X-CSRF-Protection": "1" };

beforeEach(() => {
  for (const method of ["query", "execute", "getConnection"] as const) mock.method(pool, method, async () => { throw new Error("Unexpected database access"); });
});
afterEach(() => mock.restoreAll());

async function withApp(run: (request: (path: string, options?: RequestInit) => Promise<Response>) => Promise<void>) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  try { await run((path, options) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/backend/api/auth${path}`, options)); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("cookie auth mutations require a trusted Origin and custom CSRF header", async () => {
  const logout = mock.method(SessionService, "revokeSessionFromRefresh", async () => null);
  await withApp(async (request) => {
    for (const headers of [{}, { Origin: csrf.Origin }, { "X-CSRF-Protection": "1" }, { ...csrf, Origin: "null" }, { ...csrf, Origin: "https://evil.example" }] as Record<string, string>[]) {
      const response = await request("/logout", { method: "POST", headers });
      assert.equal(response.status, 403);
    }
    const preflight = await request("/refresh", { method: "OPTIONS", headers: { Origin: csrf.Origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-csrf-protection" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.equal(logout.mock.callCount(), 0);
  });
});

test("login puts the refresh secret only in a scoped HttpOnly cookie and revokes a replaced session", async () => {
  mock.method(AuthService, "login", async () => credentials());
  const revoke = mock.method(SessionService, "revokeSessionFromRefresh", async () => ({ sessionId: "old-session", userId: 1 }));
  const disconnect = mock.method(NotificationHub, "disconnectSession", () => {});
  await withApp(async (request) => {
    const response = await request("/login", { method: "POST", headers: { ...csrf, "Content-Type": "application/json", Cookie: "mekteb_refresh=previous" }, body: JSON.stringify({ username: "cookie-test", password: "password" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.refreshToken, undefined);
    assert.equal(body.sessionId, sid);
    const cookie = response.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/backend\/api\/auth/);
    assert.doesNotMatch(cookie, /Domain=/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(revoke.mock.calls[0].arguments, ["previous"]);
    assert.deepEqual(disconnect.mock.calls[0].arguments, ["old-session"]);
  });
});

test("refresh ignores body credentials and rejects absent, ambiguous and malformed cookies", async () => {
  const refresh = mock.method(AuthService, "refreshToken", async () => credentials());
  await withApp(async (request) => {
    for (const cookie of ["", "mekteb_refresh=", "mekteb_refresh=%ZZ", "mekteb_refresh=one; mekteb_refresh=two", `mekteb_refresh=${"a".repeat(257)}`]) {
      const response = await request("/refresh", { method: "POST", headers: { ...csrf, Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: "body-credential" }) });
      assert.equal(response.status, 401);
    }
    assert.equal(refresh.mock.callCount(), 0);
    const response = await request("/refresh", { method: "POST", headers: { ...csrf, Cookie: "mekteb_refresh=current" } });
    assert.equal(response.status, 200);
    assert.deepEqual(refresh.mock.calls[0].arguments, ["current"]);
  });
});

test("replay clears the cookie and closes sockets; database failures preserve retry credentials", async () => {
  const refresh = mock.method(AuthService, "refreshToken", async () => { throw new SessionError("TOKEN_REUSED", sid, 42); });
  const disconnect = mock.method(NotificationHub, "disconnectSession", () => {});
  await withApp(async (request) => {
    const response = await request("/refresh", { method: "POST", headers: { ...csrf, Cookie: "mekteb_refresh=used" } });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "TOKEN_REUSED");
    assert.match(response.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
    assert.deepEqual(disconnect.mock.calls[0].arguments, [sid]);
    refresh.mock.mockImplementation(async () => { throw new Error("private SQL details"); });
    const outage = await request("/refresh", { method: "POST", headers: { ...csrf, Cookie: "mekteb_refresh=current" } });
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get("set-cookie"), null);
    assert.equal((await outage.json()).error, "AUTHENTICATION_UNAVAILABLE");
  });
});

test("logout is idempotent, revokes its cookie session and never claims success on a database outage", async () => {
  const revoke = mock.method(SessionService, "revokeSessionFromRefresh", async () => ({ sessionId: sid, userId: 42 }));
  const disconnect = mock.method(NotificationHub, "disconnectSession", () => {});
  await withApp(async (request) => {
    assert.equal((await request("/logout", { method: "POST", headers: csrf })).status, 200);
    assert.equal(revoke.mock.callCount(), 0);
    const response = await request("/logout", { method: "POST", headers: { ...csrf, Cookie: "mekteb_refresh=current" } });
    assert.equal(response.status, 200);
    assert.deepEqual(disconnect.mock.calls[0].arguments, [sid]);
    revoke.mock.mockImplementation(async () => { throw new Error("DB unavailable"); });
    const outage = await request("/logout", { method: "POST", headers: { ...csrf, Cookie: "mekteb_refresh=current" } });
    assert.equal(outage.status, 503);
    assert.equal(outage.headers.get("set-cookie"), null);
  });
});

test("session management is scoped to the authenticated owner, never an ID from request body", async () => {
  mock.method(UserService, "getUserById", async () => user);
  mock.method(SessionService, "isSessionActive", async () => true);
  const revokeAll = mock.method(SessionService, "revokeAllForUser", async () => 2);
  const disconnect = mock.method(NotificationHub, "disconnectUser", () => {});
  const revokeOne = mock.method(SessionService, "revokeSession", async () => false);
  const listing = mock.method(SessionService, "listActiveForUser", async () => []);
  await withApp(async (request) => {
    const headers = { ...csrf, Authorization: `Bearer ${JwtService.generateAccessToken(input)}`, "Content-Type": "application/json" };
    assert.equal((await request("/sessions", { headers })).status, 200);
    assert.deepEqual(listing.mock.calls[0].arguments, [42]);
    assert.equal((await request(`/sessions/${sid}`, { method: "DELETE", headers })).status, 404);
    assert.deepEqual(revokeOne.mock.calls[0].arguments, [sid, 42]);
    const response = await request("/logout-all", { method: "POST", headers, body: JSON.stringify({ userId: 1 }) });
    assert.equal(response.status, 200);
    assert.deepEqual(revokeAll.mock.calls[0].arguments, [42]);
    assert.deepEqual(disconnect.mock.calls[0].arguments, [42]);
    assert.match(response.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
  });
});

test("production refresh cookies require Secure and stay host-only", async () => {
  const env = { NODE_ENV: process.env.NODE_ENV, FRONTEND_URL: process.env.FRONTEND_URL };
  try {
    process.env.NODE_ENV = "production"; process.env.FRONTEND_URL = "https://school.example";
    mock.method(AuthService, "login", async () => credentials());
    await withApp(async (request) => {
      const response = await request("/login", { method: "POST", headers: { Origin: "https://school.example", "X-CSRF-Protection": "1", "Content-Type": "application/json" }, body: JSON.stringify({ username: "cookie-test", password: "password" }) });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("set-cookie")!, /^__Secure-mekteb_refresh=/);
      assert.match(response.headers.get("set-cookie")!, /; Secure;/);
      assert.doesNotMatch(response.headers.get("set-cookie")!, /Domain=/);
    });
  } finally {
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

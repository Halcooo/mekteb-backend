import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app";
import { getAllowedOrigins } from "../src/config/environment";
import { normalizeDateOnlyInput } from "../src/utils/dateInput";
import { AuthService } from "../src/services/authService";
import pool from "../src/db";

beforeEach(() => {
  for (const method of ["query", "execute", "getConnection"] as const) {
    mock.method(pool, method, async () => { throw new Error("Unexpected database access"); });
  }
});
afterEach(() => mock.restoreAll());

async function withApp(run: (url: string) => Promise<void>) {
  const app = createApp();
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("HTTP origin allowlist and security headers protect the API", async () => {
  await withApp(async (base) => {
    const allowed = await fetch(base, { headers: { Origin: "http://localhost:5173" } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");
    assert.equal(allowed.headers.get("x-powered-by"), null);
    const denied = await fetch(`${base}/backend/api/users`, { headers: { Origin: "https://untrusted.example" } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    const anonymous = await fetch(`${base}/backend/api/users`);
    assert.equal(anonymous.status, 401);
  });
});

test("malformed and oversized request bodies fail before authentication work", async () => {
  const login = mock.method(AuthService, "login", async () => ({ success: true }));
  await withApp(async (base) => {
    for (const [body, expected] of [["{broken", 400], [JSON.stringify({ text: "x".repeat(110_000) }), 413]] as const) {
      const response = await fetch(`${base}/backend/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body,
      });
      assert.equal(response.status, expected);
      assert.equal((await response.json()).error, "INVALID_REQUEST_BODY");
    }
    assert.equal(login.mock.callCount(), 0);
  });
});

test("repeated failed logins are throttled and token responses cannot be cached", async () => {
  const login = mock.method(AuthService, "login", async () => ({ success: false, message: "Invalid username or password" }));
  await withApp(async (base) => {
    for (let attempt = 1; attempt <= 21; attempt++) {
      const response = await fetch(`${base}/backend/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", "X-CSRF-Protection": "1" },
        body: JSON.stringify({ username: "example", password: "wrong-password" }),
      });
      assert.equal(response.status, attempt <= 20 ? 401 : 429);
      assert.equal(response.headers.get("cache-control"), "no-store");
      if (attempt === 21) assert.ok(response.headers.get("retry-after"));
      await response.json();
    }
    assert.equal(login.mock.callCount(), 20);
  });
});

test("production requires explicit HTTPS frontend origins", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOrigin = process.env.FRONTEND_URL;
  try {
    process.env.NODE_ENV = "production";
    for (const invalid of [undefined, "*", "http://example.test", "https://example.test/path"]) {
      if (invalid === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = invalid;
      assert.throws(getAllowedOrigins);
    }
    process.env.FRONTEND_URL = "https://example.test,https://staff.example.test";
    assert.deepEqual(getAllowedOrigins(), ["https://example.test", "https://staff.example.test"]);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousOrigin === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previousOrigin;
  }
});

test("invalid calendar dates are not silently moved to another day", () => {
  assert.equal(normalizeDateOnlyInput("2026-02-31"), null);
  assert.equal(normalizeDateOnlyInput("2026-02-29"), null);
  assert.equal(normalizeDateOnlyInput("2028-02-29"), "2028-02-29");
});

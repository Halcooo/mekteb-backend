import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import userRoutes from "../src/routes/userRoutes";
import studentRoutes from "../src/routes/studentRoutes";
import parentRoutes from "../src/routes/parentRoutes";
import pool from "../src/db";
import { JwtService } from "../src/services/jwtService";
import { UserService } from "../src/services/userService";
import { StudentService } from "../src/services/studentService";
import { SessionService } from "../src/services/sessionService";
import { generateParentKey, validateParentKeyFormat } from "../src/utils/parentKeyGenerator";

const roles = ["parent", "teacher", "admin", "user", "unknown"];
const userRow = (id: number) => ({
  id,
  username: `user${id}`,
  email: `user${id}@example.test`,
  role: roles[id - 1],
  first_name: "Test",
  last_name: "User",
  password: "private-password-hash",
  internal_secret: "must-never-be-returned",
  created_at: new Date("2026-01-01T00:00:00Z"),
});
const studentRow = {
  id: 10,
  parentId: null,
  firstName: "Student",
  lastName: "Example",
  dateOfBirth: new Date("2017-01-01T00:00:00Z"),
  gradeLevel: "1",
  parentKey: "2026-1017-ABCD",
  internal_secret: "student-private-field",
};

beforeEach(() => {
  // Every database entry point fails unless a test explicitly supplies rows.
  // These tests must never connect to a configured development/production DB.
  for (const method of ["query", "execute", "getConnection"] as const) {
    mock.method(pool, method, async () => { throw new Error("Unexpected database access in resource security test"); });
  }
  mock.method(JwtService, "verifyAccessToken", (token: string) => {
    const id = roles.indexOf(token) + 1;
    return id ? {
      userId: id, username: `user${id}`, email: `user${id}@example.test`, role: token,
      sid: "11111111-1111-4111-8111-111111111111", jti: "22222222-2222-4222-8222-222222222222",
      exp: Math.floor(Date.now() / 1000) + 900,
    } : null;
  });
  mock.method(SessionService, "isSessionActive", async () => true);
  mock.method(UserService, "getUserById", async (id: number) => roles[id - 1] ? userRow(id) : null);
});
afterEach(() => mock.restoreAll());

type RequestApi = (path: string, role?: string, method?: string, body?: unknown) => Promise<{ status: number; body: any }>;
async function withApi(run: (request: RequestApi) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use("/users", userRoutes);
  app.use("/students", studentRoutes);
  app.use("/parent", parentRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run(async (path, role, method = "GET", body) => {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { ...(role ? { Authorization: `Bearer ${role}` } : {}), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function assertPublicUser(value: Record<string, unknown>) {
  assert.deepEqual(Object.keys(value).sort(), ["id", "username", "email", "role", "first_name", "last_name", "created_at"].sort());
  assert.equal(value.password, undefined);
  assert.equal(value.internal_secret, undefined);
}

test("anonymous requests cannot read users, students, or parent data", async () => {
  await withApi(async (request) => {
    for (const path of ["/users", "/users/profile", "/students", "/students/10", "/parent/students"]) {
      assert.equal((await request(path)).status, 401, path);
    }
  });
});

test("only admins can list users, and list/profile/update return an explicit public DTO", async () => {
  const list = mock.method(UserService, "getAllUsers", async () => [userRow(1), userRow(3)]);
  mock.method(UserService, "updateUser", async (id: number, values: Parameters<typeof UserService.updateUser>[1]) => ({ ...userRow(id), first_name: values.firstName, last_name: values.lastName }));
  await withApi(async (request) => {
    for (const role of ["parent", "teacher", "user", "unknown"]) assert.equal((await request("/users", role)).status, 403);
    assert.equal(list.mock.callCount(), 0);
    const all = await request("/users", "admin");
    assert.equal(all.status, 200);
    all.body.forEach(assertPublicUser);
    const profile = await request("/users/profile", "parent");
    assert.equal(profile.status, 200);
    assertPublicUser(profile.body);
    const updated = await request("/users/1", "parent", "PUT", { firstName: "  New  ", lastName: " Name " });
    assert.equal(updated.status, 200);
    assertPublicUser(updated.body.user);
    assert.equal(updated.body.user.first_name, "New");
  });
});

test("profile updates are owner/admin-only and reject malformed IDs and names before writes", async () => {
  const update = mock.method(UserService, "updateUser", async (id: number) => userRow(id));
  await withApi(async (request) => {
    const valid = { firstName: "New", lastName: "Name" };
    assert.equal((await request("/users/2", "parent", "PUT", valid)).status, 403);
    assert.equal((await request("/users/1", "teacher", "PUT", valid)).status, 403);
    for (const id of ["1junk", "0", "-1", "1.5", "9007199254740992"]) {
      assert.equal((await request(`/users/${id}`, "admin", "PUT", valid)).status, 400, id);
    }
    for (const firstName of [null, 12, [], {}, " ", "a".repeat(101)]) {
      assert.equal((await request("/users/1", "parent", "PUT", { ...valid, firstName })).status, 400);
    }
    assert.equal(update.mock.callCount(), 0);
    assert.equal((await request("/users/2", "admin", "PUT", valid)).status, 200);
    assert.equal(update.mock.callCount(), 1);
  });
});

test("all student collection and CRUD endpoints reject parents and legacy users; staff retain invitations", async () => {
  const list = mock.method(StudentService, "getAllStudents", async () => ({ students: [studentRow], totalCount: 1, totalPages: 1 }));
  const endpoints = [
    ["GET", "/students"], ["GET", "/students/search?q=Student"], ["GET", "/students/stats"],
    ["GET", "/students/10"], ["GET", "/students/parent/1"], ["GET", "/students/grade/1"],
    ["POST", "/students"], ["PUT", "/students/10"], ["DELETE", "/students/10"],
  ];
  await withApi(async (request) => {
    for (const role of ["parent", "user", "unknown"]) {
      for (const [method, path] of endpoints) assert.equal((await request(path, role, method, method === "POST" || method === "PUT" ? {} : undefined)).status, 403, `${role} ${method} ${path}`);
    }
    assert.equal(list.mock.callCount(), 0);
    for (const role of ["admin", "teacher"]) {
      const response = await request("/students", role);
      assert.equal(response.status, 200);
      assert.equal(response.body.data[0].parentKey, studentRow.parentKey);
    }
  });
});

test("student routes reject partial IDs and invalid structured fields without touching the DB", async () => {
  await withApi(async (request) => {
    for (const id of ["0", "-1", "10tail", "1.5", "9007199254740992"]) {
      for (const method of ["GET", "PUT", "DELETE"]) assert.equal((await request(`/students/${id}`, "admin", method, method === "PUT" ? { firstName: "Test" } : undefined)).status, 400);
    }
    assert.equal((await request("/students?limit=1001", "admin")).status, 400);
    assert.equal((await request("/students?search=a&search=b", "admin")).status, 400);
    const valid = { firstName: "Student", lastName: "Example", dateOfBirth: "2017-01-01", gradeLevel: "1" };
    for (const firstName of [42, [], {}, null, " "]) assert.equal((await request("/students", "admin", "POST", { ...valid, firstName })).status, 400);
    assert.equal((await request("/students", "admin", "POST", { ...valid, parentId: 1.5 })).status, 400);
  });
});

test("parent student list is scoped to the caller and never includes invitation keys or extra DB fields", async () => {
  const seen: unknown[] = [];
  mock.method(pool, "execute", async (_sql: unknown, parameters?: unknown) => {
    seen.push(parameters);
    return [[{ ...studentRow, connectedAt: "2026-10-17", attendance_rate: "50", last_attendance_date: "2026-10-16" }], []];
  });
  await withApi(async (request) => {
    assert.equal((await request("/parent/students", "teacher")).status, 403);
    assert.equal((await request("/parent/students", "unknown")).status, 403);
    for (const role of ["parent", "user", "admin"]) {
      const response = await request("/parent/students", role);
      assert.equal(response.status, 200);
      assert.equal(response.body.data[0].id, 10);
      assert.equal(response.body.data[0].parentKey, undefined);
      assert.equal(response.body.data[0].internal_secret, undefined);
      assert.equal(response.body.data[0].attendanceRate, 50);
    }
    assert.deepEqual(seen, [[1], [4], [3]]);
  });
});

test("connecting validates invitation format and returns no reusable invitation key", async () => {
  mock.method(StudentService, "getStudentById", async () => studentRow);
  const seen: unknown[] = [];
  mock.method(pool, "execute", async (sql: unknown, parameters?: unknown) => {
    seen.push(parameters);
    if (String(sql).startsWith("SELECT * FROM students")) return [[{ id: 10 }], []];
    if (String(sql).startsWith("SELECT * FROM parent_students")) return [[], []];
    if (String(sql).startsWith("INSERT INTO parent_students")) return [{ affectedRows: 1 }, []];
    throw new Error("Unexpected query");
  });
  await withApi(async (request) => {
    for (const parentKey of [null, [], {}, 42, "invalid", "2026-1017-ABCDE"]) assert.equal((await request("/parent/connect", "parent", "POST", { parentKey })).status, 400);
    assert.equal(seen.length, 0);
    const response = await request("/parent/connect", "parent", "POST", { parentKey: " 2026-1017-abcd " });
    assert.equal(response.status, 200);
    assert.equal(response.body.student.id, 10);
    assert.equal(response.body.student.parentKey, undefined);
    assert.equal(response.body.student.internal_secret, undefined);
    assert.deepEqual(seen, [["2026-1017-ABCD"], [1, 10], [1, 10]]);
  });
});

test("parent attendance checks the current relationship and invalid IDs never reach the DB", async () => {
  const calls: unknown[] = [];
  mock.method(pool, "execute", async (_sql: unknown, parameters?: unknown) => { calls.push(parameters); return [[], []]; });
  mock.method(console, "error", () => {});
  await withApi(async (request) => {
    for (const id of ["0", "-1", "10tail", "1.5", "9007199254740992"]) {
      for (const path of [`/parent/students/${id}/attendance`, `/parent/students/${id}/attendance/stats`]) assert.equal((await request(path, "parent")).status, 400);
      assert.equal((await request(`/parent/students/${id}`, "parent", "DELETE")).status, 400);
    }
    for (const limit of ["0", "2tail", "201", "1.5"]) assert.equal((await request(`/parent/students/10/attendance?limit=${limit}`, "parent")).status, 400);
    assert.equal(calls.length, 0);
    assert.equal((await request("/parent/students/10/attendance", "parent")).status, 403);
    assert.equal((await request("/parent/students/10/attendance/stats", "parent")).status, 403);
    assert.deepEqual(calls, [[1, 10], [1, 10]]);
  });
});

test("parent disconnect removes only the current user's relationship", async () => {
  const calls: unknown[] = [];
  mock.method(pool, "execute", async (_sql: unknown, parameters?: unknown) => { calls.push(parameters); return [{ affectedRows: 1 }, []]; });
  await withApi(async (request) => {
    const response = await request("/parent/students/10", "parent", "DELETE");
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [[1, 10]]);
  });
});

test("new invitations use cryptographic randomness while preserving the existing key format", () => {
  mock.method(Math, "random", () => { throw new Error("Invitation generation must not use Math.random"); });
  assert.equal(validateParentKeyFormat(generateParentKey()), true);
});

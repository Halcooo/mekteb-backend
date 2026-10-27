import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, mock, test } from "node:test";
import type { Server } from "node:http";
import express from "express";
import commentRoutes from "../src/routes/commentRoutes";
import { CommentService, CommentServiceError } from "../src/services/commentService";
import { ParentService } from "../src/services/parentService";
import { NotificationService } from "../src/services/notificationService";
import { JwtService } from "../src/services/jwtService";
import { UserService } from "../src/services/userService";
import { SessionService } from "../src/services/sessionService";
import pool from "../src/db";

let server: Server;
let baseUrl: string;
let actor: { userId: number; username: string; email: string; role: string };
let validToken: boolean;
let stubs: Record<string, any>;
const originalUpdate = CommentService.updateComment;
const originalDelete = CommentService.deleteComment;
const originalThread = CommentService.getCommentThread;
const requestBody = { studentId: 11, content: "Hello", date: "2026-10-17" };

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/comments", commentRoutes);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}/comments`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

beforeEach(() => {
  actor = { userId: 7, username: "test-parent", email: "parent@example.invalid", role: "parent" };
  validToken = true;
  stubs = {};
  // Fail closed if a test accidentally reaches a real database operation.
  stubs.execute = mock.method(pool, "execute", async () => { throw new Error("Unexpected database call"); });
  stubs.query = mock.method(pool, "query", async () => { throw new Error("Unexpected database call"); });
  mock.method(JwtService, "verifyAccessToken", () => validToken ? {
    ...actor, sid: "11111111-1111-4111-8111-111111111111",
    jti: "22222222-2222-4222-8222-222222222222", exp: Math.floor(Date.now() / 1000) + 900,
  } : null);
  mock.method(SessionService, "isSessionActive", async () => true);
  mock.method(UserService, "getUserById", async () => ({ id: actor.userId, ...actor }));
  stubs.relation = mock.method(ParentService, "isStudentConnectedToParentUser", async (_userId: number, studentId: number) => studentId === 11);
  mock.method(ParentService, "getConnectedParentUserIds", async () => [7]);
  stubs.notification = mock.method(NotificationService, "createForUsers", async () => {});
  stubs.access = mock.method(CommentService, "getCommentAccessById", async (id: number) => {
    if (id === 999) throw new CommentServiceError("Comment not found", 404);
    return {
      id,
      studentId: id === 102 || id === 104 ? 22 : 11,
      authorId: id === 103 || id === 104 ? 7 : 8,
      date: "2026-10-17",
    };
  });
  stubs.list = mock.method(CommentService, "getComments", async () => ({ comments: [], total: 0 }));
  stubs.student = mock.method(CommentService, "getStudentComments", async () => []);
  stubs.daily = mock.method(CommentService, "getDailyComments", async () => []);
  stubs.thread = mock.method(CommentService, "getCommentThread", async () => []);
  stubs.create = mock.method(CommentService, "createComment", async (data: any) => ({ id: 501, ...data }));
  stubs.update = mock.method(CommentService, "updateComment", async (id: number, data: any) => ({ id, ...data }));
  stubs.delete = mock.method(CommentService, "deleteComment", async () => {});
});

afterEach(() => mock.restoreAll());

async function request(path: string, method = "GET", body?: unknown, authenticated = true) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(authenticated ? { authorization: "Bearer test-token" } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

function assertNoContentOrWrites() {
  for (const name of ["list", "student", "daily", "thread", "create", "update", "delete", "notification"]) {
    assert.equal(stubs[name].mock.callCount(), 0, `${name} must not be called`);
  }
  assert.equal(stubs.execute.mock.callCount(), 0);
  assert.equal(stubs.query.mock.callCount(), 0);
}

test("unauthenticated and invalid tokens cannot access comments", async () => {
  assert.equal((await request("/student/11", "GET", undefined, false)).status, 401);
  validToken = false;
  assert.equal((await request("/student/11")).status, 401);
  assert.equal(stubs.access.mock.callCount(), 0);
  assertNoContentOrWrites();
});

test("unknown roles cannot reach any comment endpoint", async () => {
  actor.role = "unknown";
  for (const [method, path] of [
    ["GET", "/"], ["GET", "/student/11"], ["GET", "/daily/2026-10-17"],
    ["GET", "/thread/101"], ["POST", "/"], ["PUT", "/103"], ["DELETE", "/103"],
  ]) {
    assert.equal((await request(path, method, ["POST", "PUT"].includes(method) ? requestBody : undefined)).status, 403);
  }
  assert.equal(stubs.access.mock.callCount(), 0);
  assertNoContentOrWrites();
});

for (const role of ["parent", "user"]) {
  test(`${role} cannot list all comments or comments for an unconnected student`, async () => {
    actor.role = role;
    for (const path of ["/", "/?studentId=22", "/student/22", "/thread/102", "/daily/2026-10-17"]) {
      assert.equal((await request(path)).status, 403, path);
    }
    assertNoContentOrWrites();
  });

  test(`${role} can list/read only a connected student's comments and thread`, async () => {
    actor.role = role;
    assert.equal((await request("/?studentId=11")).status, 200);
    assert.equal((await request("/student/11?date=2026-10-17")).status, 200);
    assert.equal((await request("/thread/101")).status, 200);
    assert.deepEqual(stubs.thread.mock.calls[0].arguments, [101, 11]);
    assert.deepEqual(stubs.relation.mock.calls.map((call: any) => call.arguments), [[7, 11], [7, 11], [7, 11]]);
  });

  test(`${role} can reply to a connected student's comment using authenticated identity`, async () => {
    actor.role = role;
    const response = await request("/", "POST", { ...requestBody, content: "  Hello  ", parentCommentId: 101, authorId: 9999, authorRole: "admin" });
    assert.equal(response.status, 201);
    assert.deepEqual(stubs.create.mock.calls[0].arguments[0], {
      ...requestBody, content: "Hello", parentCommentId: 101, authorId: 7, authorRole: "parent",
    });
    assert.equal(stubs.notification.mock.callCount(), 0, "Notification fan-out belongs to the message transaction, not the controller");
  });

  test(`${role} cannot create originals or reply to an unconnected student`, async () => {
    actor.role = role;
    assert.equal((await request("/", "POST", requestBody)).status, 403);
    assert.equal((await request("/", "POST", { ...requestBody, studentId: 22, parentCommentId: 102 })).status, 403);
    assert.equal((await request("/", "POST", { ...requestBody, parentCommentId: 102 })).status, 403);
    assertNoContentOrWrites();
  });

  test(`${role} cannot mutate another author or even their own comment after disconnection`, async () => {
    actor.role = role;
    for (const id of [101, 104]) {
      assert.equal((await request(`/${id}`, "PUT", { content: "Edited" })).status, 403);
      assert.equal((await request(`/${id}`, "DELETE")).status, 403);
    }
    assertNoContentOrWrites();
  });

  test(`${role} can edit and delete own comments for a connected student`, async () => {
    actor.role = role;
    assert.equal((await request("/103", "PUT", { content: " Edited " })).status, 200);
    assert.equal((await request("/103", "DELETE")).status, 200);
    assert.deepEqual(stubs.update.mock.calls[0].arguments, [103, { content: "Edited" }, 7, false]);
    assert.deepEqual(stubs.delete.mock.calls[0].arguments, [103, 7, false]);
  });
}

for (const role of ["admin", "teacher"]) {
  test(`${role} can read daily/all comments and create original comments`, async () => {
    actor.role = role;
    assert.equal((await request("/")).status, 200);
    assert.equal((await request("/student/22")).status, 200);
    assert.equal((await request("/daily/2026-10-17")).status, 200);
    assert.equal((await request("/thread/102")).status, 200);
    assert.equal((await request("/", "POST", requestBody)).status, 201);
    assert.equal(stubs.relation.mock.callCount(), 0);
  });
}

test("admin can moderate another author's comment, while teacher cannot", async () => {
  actor.role = "teacher";
  assert.equal((await request("/101", "PUT", { content: "Edited" })).status, 403);
  assert.equal((await request("/101", "DELETE")).status, 403);
  assertNoContentOrWrites();
  actor.role = "admin";
  assert.equal((await request("/101", "PUT", { content: "Edited" })).status, 200);
  assert.equal((await request("/101", "DELETE")).status, 200);
  assert.deepEqual(stubs.update.mock.calls[0].arguments, [101, { content: "Edited" }, 7, true]);
  assert.deepEqual(stubs.delete.mock.calls[0].arguments, [101, 7, true]);
});

test("teacher can modify own comment", async () => {
  actor.role = "teacher";
  actor.userId = 8;
  assert.equal((await request("/101", "PUT", { content: "Edited" })).status, 200);
  assert.equal((await request("/101", "DELETE")).status, 200);
});

test("reply cannot cross student or date boundaries", async () => {
  actor.role = "teacher";
  assert.equal((await request("/", "POST", { ...requestBody, parentCommentId: 102 })).status, 400);
  assert.equal((await request("/", "POST", { ...requestBody, date: "2026-10-16", parentCommentId: 101 })).status, 400);
  assertNoContentOrWrites();
});

test("parent filter cannot refer to another student's comment", async () => {
  assert.equal((await request("/?studentId=11&parentCommentId=102")).status, 403);
  assertNoContentOrWrites();
});

test("missing comments return 404 rather than a generic server failure", async () => {
  assert.equal((await request("/thread/999")).status, 404);
  assert.equal((await request("/999", "PUT", { content: "Edited" })).status, 404);
  assert.equal((await request("/999", "DELETE")).status, 404);
  assertNoContentOrWrites();
});

test("malformed IDs and unbounded pagination are rejected before database reads", async () => {
  actor.role = "admin";
  for (const path of [
    "/student/0", "/student/-1", "/student/11abc", "/student/1.5", "/thread/0",
    "/?studentId=0", "/?studentId=11abc", "/?studentId=11&studentId=22",
    "/?parentCommentId=-1", "/?page=0", "/?limit=101", "/?limit=-1", "/?limit=1.5",
    "/?page=9007199254740991&limit=100", "/?authorRole=unknown",
    "/student/11?date=2026-02-31", "/daily/2026-02-31",
  ]) {
    assert.equal((await request(path)).status, 400, path);
  }
  assert.equal(stubs.access.mock.callCount(), 0);
  assertNoContentOrWrites();
});

test("empty, non-text, or oversized message bodies and malformed write IDs are rejected", async () => {
  actor.role = "admin";
  for (const content of ["   ", "x".repeat(2001), 42, {}, []]) {
    assert.equal((await request("/", "POST", { ...requestBody, content })).status, 400);
    assert.equal((await request("/101", "PUT", { content })).status, 400);
  }
  for (const id of [0, -1, "11abc", 1.5, "9007199254740992"]) {
    assert.equal((await request("/", "POST", { ...requestBody, studentId: id })).status, 400);
    assert.equal((await request("/", "POST", { ...requestBody, parentCommentId: id })).status, 400);
  }
  assert.equal((await request("/0", "PUT", { content: "Text" })).status, 400);
  assert.equal((await request("/0", "DELETE")).status, 400);
  assert.equal(stubs.access.mock.callCount(), 0);
  assertNoContentOrWrites();
});

test("service preserves 403 ownership errors and never executes unauthorized mutations", async () => {
  await assert.rejects(originalUpdate.call(CommentService, 101, { content: "Edited" }, 7), (error: any) => error instanceof CommentServiceError && error.status === 403);
  await assert.rejects(originalDelete.call(CommentService, 101, 7), (error: any) => error instanceof CommentServiceError && error.status === 403);
  assertNoContentOrWrites();
});

test("thread SQL scopes every returned message to the authorized student", async () => {
  stubs.execute.mock.mockImplementation(async () => [[], []]);
  await originalThread.call(CommentService, 101, 11);
  const [sql, params] = stubs.execute.mock.calls[0].arguments;
  assert.match(sql, /c\.student_id = \? AND \(c\.id = \? OR c\.parent_comment_id = \?\)/);
  assert.deepEqual(params, [11, 101, 101]);
});

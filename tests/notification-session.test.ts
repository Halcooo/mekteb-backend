import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import { NotificationHub } from "../src/services/notificationHub";
import { JwtService } from "../src/services/jwtService";
import { SessionService } from "../src/services/sessionService";
import pool from "../src/db";

const sessionId = "11111111-1111-4111-8111-111111111111";
const secondSessionId = "22222222-2222-4222-8222-222222222222";
const identity = { userId: 7, username: "test", email: "test@example.invalid", role: "parent", sid: sessionId };
const origin = "http://localhost:5173";
let active: (sid: string, userId: number) => Promise<boolean>;
let activeCalls: Array<[string, number]>;

beforeEach(() => {
  for (const method of ["query", "execute", "getConnection"] as const) {
    mock.method(pool, method, async () => { throw new Error("Unexpected database access in websocket test"); });
  }
  active = async () => true;
  activeCalls = [];
  mock.method(SessionService, "isSessionActive", async (sid: string, userId: number) => {
    activeCalls.push([sid, userId]);
    return active(sid, userId);
  });
});
afterEach(() => mock.restoreAll());

async function bounded<T>(promise: Promise<T>, label: string, milliseconds = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

type Connected = {
  socket: WebSocket;
  closed: Promise<{ code: number; reason: string }>;
  received: string[];
};
type SocketFixture = {
  server: Server;
  serverClosed: Promise<void>;
  connect: (token: string, requestedOrigin?: string | null, waitForAuth?:boolean) => Promise<Connected>;
};

async function withHub(run: (fixture: SocketFixture) => Promise<void>): Promise<void> {
  const server = createServer((_req, res) => { res.writeHead(404); res.end(); });
  const serverClosed = new Promise<void>((resolve) => server.once("close", resolve));
  NotificationHub.init(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const sockets: Connected[] = [];
  try {
    await run({
      server,
      serverClosed,
      connect: async (token, requestedOrigin = origin, waitForAuth=true) => {
        const url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/backend/ws/notifications`;
        const socket = new WebSocket(url, requestedOrigin === null ? {} : { origin: requestedOrigin });
        const received: string[] = [];
        const closed = new Promise<{ code: number; reason: string }>((resolve) => {
          socket.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
        });
        let ready!:()=>void;
        const authenticated=new Promise<void>(resolve=>{ready=resolve;});
        socket.on("message", (message) => {if(JSON.parse(message.toString()).type==='ready')ready();else received.push(message.toString());});
        // An error listener also prevents cleanup-induced close from becoming
        // an uncaught event; the awaited open/close still asserts the outcome.
        socket.on("error", () => {});
        const connected = { socket, closed, received };
        sockets.push(connected);
        await bounded(once(socket, "open"), "websocket upgrade");
        if(socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type:"authenticate",accessToken:token}));
        if(waitForAuth)await bounded(Promise.race([authenticated,closed]),'authentication result');
        await new Promise<void>((resolve) => setImmediate(resolve));
        return connected;
      },
    });
  } finally {
    for (const client of sockets) {
      if (client.socket.readyState !== WebSocket.CLOSED) client.socket.terminate();
    }
    await Promise.all(sockets.map((client) => bounded(client.closed, "client cleanup")));
    if (server.listening) server.close();
    await bounded(serverClosed, "server cleanup");
  }
}

async function receive(client: Connected): Promise<Record<string, unknown>> {
  const [message] = await bounded(once(client.socket, "message"), "notification");
  return JSON.parse(message.toString()) as Record<string, unknown>;
}

test("websocket authentication rejects absent/untrusted Origin before checking session data", async () => {
  const token = JwtService.generateAccessToken(identity);
  await withHub(async ({ connect }) => {
    for (const requestedOrigin of [null, "https://untrusted.example", "http://localhost:5174"]) {
      const client = await connect(token, requestedOrigin);
      const closed = await bounded(client.closed, "origin rejection");
      assert.equal(closed.code, 1008);
      assert.equal(closed.reason, "Origin not allowed");
    }
  });
  assert.deepEqual(activeCalls, []);
});

test("websocket authentication rejects inactive sessions and legacy sid-less access JWTs", async () => {
  active = async () => false;
  await withHub(async ({ connect }) => {
    const inactive = await connect(JwtService.generateAccessToken(identity));
    assert.equal((await bounded(inactive.closed, "inactive-session rejection")).code, 1008);
    assert.deepEqual(activeCalls, [[sessionId, 7]]);
    const legacy = jwt.sign({ userId: 7, username: "test", email: "test@example.invalid", role: "parent", tokenType: "access" }, process.env.JWT_SECRET!, {
      issuer: "mekteb-app", audience: "mekteb-users", algorithm: "HS256", expiresIn: "15m",
    });
    const missingSid = await connect(legacy);
    assert.equal((await bounded(missingSid.closed, "sid-less rejection")).code, 1008);
    assert.equal(activeCalls.length, 1, "invalid JWTs never query the session store");
  });
});

test("an active socket receives only its user's event after a fresh session check", async () => {
  await withHub(async ({ connect }) => {
    const client = await connect(JwtService.generateAccessToken(identity));
    const message = receive(client);
    NotificationHub.notifyUsers([7, 7], "notification:new");
    assert.deepEqual(await message, { type: "notification:new", recipientUserId: 7 });
    assert.deepEqual(activeCalls, [[sessionId, 7], [sessionId, 7]]);
    NotificationHub.notifyUser(99, "notification:new");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(client.received.length, 1);
    assert.equal(activeCalls.length, 2);
  });
});

test("local session revocation closes that device while another device remains active", async () => {
  await withHub(async ({ connect }) => {
    const first = await connect(JwtService.generateAccessToken(identity));
    const second = await connect(JwtService.generateAccessToken({ ...identity, sid: secondSessionId }));
    NotificationHub.disconnectSession(sessionId);
    const closed = await bounded(first.closed, "local session revocation");
    assert.equal(closed.code, 1008);
    assert.equal(closed.reason, "Session revoked");
    const message = receive(second);
    NotificationHub.notifyUser(7, "notification:update");
    assert.deepEqual(await message, { type: "notification:update", recipientUserId: 7 });
    assert.equal(first.received.length, 0);
  });
});

test("database revocation discovered during publish closes the socket without delivering any event", async () => {
  await withHub(async ({ connect }) => {
    const client = await connect(JwtService.generateAccessToken(identity));
    active = async () => false;
    NotificationHub.notifyUser(7, "notification:new");
    assert.equal((await bounded(client.closed, "database revocation")).code, 1008);
    assert.equal(client.received.length, 0);
    assert.equal(activeCalls.length, 2);
  });
});

test("database failure at handshake or publish fails closed without an event", async () => {
  await withHub(async ({ connect }) => {
    active = async () => { throw new Error("Database unavailable"); };
    const rejected = await connect(JwtService.generateAccessToken(identity));
    assert.equal((await bounded(rejected.closed, "handshake database failure")).code, 1011);
    active = async () => true;
    const client = await connect(JwtService.generateAccessToken(identity));
    active = async () => { throw new Error("Database unavailable"); };
    NotificationHub.notifyUser(7, "notification:new");
    assert.equal((await bounded(client.closed, "publish database failure")).code, 1011);
    assert.equal(client.received.length, 0);
  });
});

test("access-token expiry closes an idle socket without waiting for a notification", async () => {
  // Sign an isolated short-lived JWT; do not change process-wide expiry settings.
  const token = jwt.sign({ ...identity, tokenType: "access", jti: randomUUID(), exp: Math.ceil(Date.now() / 1000) + 1 }, process.env.JWT_SECRET!, {
    algorithm: "HS256", issuer: "mekteb-app", audience: "mekteb-users",
  });
  await withHub(async ({ connect }) => {
    const client = await connect(token);
    const closed = await bounded(client.closed, "token expiry", 3500);
    assert.equal(closed.code, 1008);
    assert.equal(closed.reason, "Token expired");
    assert.equal(client.received.length, 0);
  });
});

test("server close releases the hub so a later server can initialize and receive notifications", async () => {
  await withHub(async ({ connect }) => {
    const client = await connect(JwtService.generateAccessToken(identity));
    client.socket.close(1000, "Test cleanup");
    await bounded(client.closed, "normal socket cleanup");
  });
  await withHub(async ({ connect }) => {
    const client = await connect(JwtService.generateAccessToken(identity));
    const message = receive(client);
    NotificationHub.notifyUser(7, "notification:new");
    assert.equal((await message).recipientUserId, 7);
  });
});

test("server shutdown completes while an authenticated websocket is still connected", async () => {
  await withHub(async ({ connect, server, serverClosed }) => {
    const client = await connect(JwtService.generateAccessToken(identity));
    NotificationHub.close();
    NotificationHub.close(); // Repeated shutdown remains safe.
    server.close();
    await bounded(serverClosed, "server shutdown with an active websocket");
    await bounded(client.closed, "socket termination during shutdown");
  });
});

test("shutdown closes sockets with pending authentication and ignores late session results", async () => {
  let completeAuthentication!: (active: boolean) => void;
  active = () => new Promise<boolean>((resolve) => { completeAuthentication = resolve; });
  await withHub(async ({ connect, server, serverClosed }) => {
    const client = await connect(JwtService.generateAccessToken(identity),origin,false);
    await bounded(new Promise<void>(resolve=>{const check=()=>activeCalls.length?resolve():setImmediate(check);check();}),'pending authentication lookup');
    assert.equal(activeCalls.length, 1);
    NotificationHub.close();
    server.close();
    await bounded(serverClosed, "shutdown during session lookup");
    await bounded(client.closed, "pending socket termination");
    completeAuthentication(true);
    await new Promise<void>((resolve) => setImmediate(resolve));
    NotificationHub.notifyUser(7, "notification:new");
    assert.equal(activeCalls.length, 1, "late authentication must not add the closed socket");
    assert.equal(client.received.length, 0);
  });
});

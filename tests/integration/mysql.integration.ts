// Opt-in integration suite. Requires a disposable, marked MySQL instance.
// Never reads .env and refuses normal database ports or an unverified datadir.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { test, mock } from "node:test";
import webPush from 'web-push';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from "node:net";
import mysql, { type RowDataPacket } from "mysql2/promise";

const port = Number(process.env.MEKTEB_TEST_MYSQL_PORT);
const testDir = process.env.MEKTEB_TEST_MYSQL_DIRECTORY;
if (!testDir || !Number.isInteger(port) || port < 10000 || port > 65535) {
  throw new Error("Set MEKTEB_TEST_MYSQL_PORT (10000..65535) and MEKTEB_TEST_MYSQL_DIRECTORY for a marked disposable instance");
}
assert.equal(readFileSync(path.join(testDir, "test-instance-marker"), "utf8").trim(), "isolated-mekteb-test");
process.env.NODE_ENV = "test";
process.env.DB_HOST = "127.0.0.1";
process.env.DB_PORT = String(port);
process.env.DB_USER = "root";
process.env.DB_PASS = "";
process.env.DB_NAME = `mekteb_test_${randomUUID().replace(/-/g, "")}`;
process.env.JWT_SECRET = "isolated-integration-access-secret-at-least-32-bytes";
process.env.JWT_REFRESH_SECRET = "isolated-integration-refresh-pepper-at-least-32-bytes";
process.env.JWT_EXPIRE = "15m";
process.env.JWT_REFRESH_EXPIRE = "30d";
process.env.FRONTEND_URL = "http://localhost:5173";
const database = process.env.DB_NAME;

test("MySQL baseline, migration recovery and durable sessions through real HTTP", async () => {
  const admin = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", password: "" });
  let pool: mysql.Pool | undefined;
  let server: ReturnType<ReturnType<(typeof import("../../src/app"))["createApp"]>["listen"]> | undefined;
  const migrationDir = await mkdtemp(path.join(testDir, "migrations-"));
  const normalize = (value: string) => path.resolve(value).replace(/[\\/]+$/, "").toLowerCase();
  let verified = false;
  try {
    const [identity] = await admin.query<RowDataPacket[]>("SELECT @@datadir AS data_dir, @@port AS port");
    assert.equal(normalize(identity[0].data_dir), normalize(path.join(testDir, "data")));
    assert.equal(Number(identity[0].port), port);
    verified = true;
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = (await import("../../src/db")).default;
    const { MigrationSystem, splitMigrationSql } = await import("../../src/utils/MigrationSystem");
    const { SessionService, SessionError } = await import("../../src/services/sessionService");
    const { JwtService } = await import("../../src/services/jwtService");
    await cp(path.resolve("migrations"), migrationDir, { recursive: true });
    const system = new MigrationSystem(pool, migrationDir);
    assert.equal((await system.status()).pending.length, 7);
    const [empty] = await pool.query<RowDataPacket[]>("SHOW TABLES");
    assert.equal(empty.length, 0, "status must not initialize metadata");
    assert.equal((await system.runMigrations()).length, 7);
    assert.deepEqual(await system.runMigrations(), []);
    assert.deepEqual((await system.status()).issues, []);
    const runNode = promisify(execFile);
    const cli = await runNode(process.execPath, ["--import", "tsx", "scripts/migrate.js", "status"], { env: process.env });
    assert.deepEqual(JSON.parse(cli.stdout).pending, []);
    const cliUp = await runNode(process.execPath, ["--import", "tsx", "scripts/migrate.js", "up"], { env: process.env });
    assert.deepEqual(JSON.parse(cliUp.stdout).applied, []);
    const adminEnvironment = { ...process.env, BOOTSTRAP_ADMIN_USERNAME: "integration-admin", BOOTSTRAP_ADMIN_EMAIL: "admin@example.test", BOOTSTRAP_ADMIN_PASSWORD: "integration-admin-password-123", BOOTSTRAP_ADMIN_FIRST_NAME: "Integration", BOOTSTRAP_ADMIN_LAST_NAME: "Admin" };
    const adminCli = await runNode(process.execPath, ["--import", "tsx", "scripts/create-admin.js"], { env: adminEnvironment });
    assert.match(adminCli.stdout, /Created administrator account/);
    assert.ok(!adminCli.stdout.includes(adminEnvironment.BOOTSTRAP_ADMIN_PASSWORD));
    await assert.rejects(runNode(process.execPath, ["--import", "tsx", "scripts/create-admin.js"], { env: adminEnvironment }));
    console.log("PASS: all seven migrations on empty MySQL, read-only status and repeat up");

    // Existing schema can only be adopted after validation, with data preserved.
    await pool.execute("DELETE FROM migrations WHERE filename = '000_create_core_tables.sql'");
    assert.equal((await system.status()).baselineAdoptionRequired, true);
    await assert.rejects(system.runMigrations(), /baseline adoption/);
    await system.adoptBaseline(true);
    assert.deepEqual((await system.status()).issues, []);
    const baseline = await readFile(path.join(migrationDir, "000_create_core_tables.sql"), "utf8");
    await writeFile(path.join(migrationDir, "000_create_core_tables.sql"), baseline + "\n-- changed\n");
    await assert.rejects(system.runMigrations(), /Checksum mismatch/);
    await writeFile(path.join(migrationDir, "000_create_core_tables.sql"), baseline);

    // A real partially committed DDL must block retry until operator recovery.
    await writeFile(path.join(migrationDir, "007_integration_failure.sql"), "CREATE TABLE integration_probe (id INT PRIMARY KEY); INSERT INTO integration_required VALUES (1);");
    await assert.rejects(system.runMigrations(), /stopped after 1\/2/);
    assert.equal((await system.status()).unresolved.length, 1);
    await assert.rejects(system.runMigrations(), /Unresolved/);
    await pool.query("DROP TABLE integration_probe");
    await pool.query("CREATE TABLE integration_required (id INT PRIMARY KEY)");
    await system.resolveFailedMigration("007_integration_failure.sql", "retry", true);
    assert.deepEqual(await system.runMigrations(), ["007_integration_failure.sql"]);
    console.log("PASS: schema adoption, changed-file detection and partial-DDL recovery");

    const { createApp } = await import("../../src/app");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/backend/api`;
    const csrf = { Origin: "http://localhost:5173", "X-CSRF-Protection": "1", "Content-Type": "application/json" };
    const call = async (route: string, body?: unknown, cookie?: string, token?: string) => {
      const response = await fetch(base + route, { method: body === undefined ? "GET" : "POST", headers: { ...csrf, ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
    };
    const registered = await call("/auth/register", { firstName: "Integration", lastName: "Parent", username: "integration-parent", email: "parent@example.test", password: "integration-password-123", role: "admin" });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.user.role, "parent");
    assert.equal(registered.body.refreshToken, undefined);
    assert.equal(registered.body.user.password, undefined);
    assert.ok(registered.cookie);
    const userId: number = registered.body.user.id;
    assert.equal((await call("/users/profile", undefined, undefined, registered.body.accessToken)).status, 200);
    const refreshed = await call("/auth/refresh", {}, registered.cookie);
    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.cookie, registered.cookie);
    const replay = await call("/auth/refresh", {}, registered.cookie);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error, "TOKEN_REUSED");
    assert.equal((await call("/users/profile", undefined, undefined, refreshed.body.accessToken)).status, 401);
    assert.equal((await call("/auth/refresh", {}, refreshed.cookie)).status, 401);
    console.log("PASS: registration, HttpOnly rotation, replay revocation and access denial");

    const loginBody = { username: "integration-parent", password: "integration-password-123" };
    const device1 = await call("/auth/login", loginBody);
    const device2 = await call("/auth/login", loginBody);
    assert.equal(device1.status, 200); assert.equal(device2.status, 200);
    assert.notEqual(device1.body.sessionId, device2.body.sessionId);
    assert.equal((await call("/auth/logout", {}, device1.cookie)).status, 200);
    assert.equal((await call("/users/profile", undefined, undefined, device1.body.accessToken)).status, 401);
    assert.equal((await call("/users/profile", undefined, undefined, device2.body.accessToken)).status, 200);
    assert.equal((await call("/auth/logout-all", {}, device2.cookie, device2.body.accessToken)).status, 200);
    assert.equal((await call("/users/profile", undefined, undefined, device2.body.accessToken)).status, 401);
    console.log("PASS: independent devices, server logout and logout-all");

    const session = await SessionService.createSession(userId, { userAgent: "durability-test" });
    const [stored] = await pool.execute<RowDataPacket[]>("SELECT current_refresh_hash, expires_at FROM auth_sessions WHERE id = ?", [session.sessionId]);
    assert.equal(stored[0].current_refresh_hash.length, 64);
    assert.ok(!JSON.stringify(stored).includes(session.refreshToken));
    await assert.rejects(SessionService.rotateRefreshToken(`${session.sessionId}.${"x".repeat(43)}`), SessionError);
    assert.equal(await SessionService.isSessionActive(session.sessionId, userId), true, "unknown token must not revoke its guessed session");
    const parallel = await Promise.allSettled([SessionService.rotateRefreshToken(session.refreshToken), SessionService.rotateRefreshToken(session.refreshToken)]);
    assert.equal(parallel.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(parallel.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await SessionService.isSessionActive(session.sessionId, userId), false);
    const expired = await SessionService.createSession(userId);
    await pool.execute("UPDATE auth_sessions SET expires_at = DATE_SUB(CURRENT_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id = ?", [expired.sessionId]);
    assert.equal(await SessionService.isSessionActive(expired.sessionId, userId), false);
    await assert.rejects(SessionService.rotateRefreshToken(expired.refreshToken), SessionError);
    const durable = await SessionService.createSession(userId);
    const freshConnection = await mysql.createConnection({ host: "127.0.0.1", port, user: "root", database });
    try {
      const [persisted] = await freshConnection.execute<RowDataPacket[]>("SELECT current_refresh_hash FROM auth_sessions WHERE id = ?", [durable.sessionId]);
      assert.equal(persisted[0].current_refresh_hash, JwtService.hashRefreshToken(durable.refreshToken));
    } finally { await freshConnection.end(); }
    const rotated = await SessionService.rotateRefreshToken(durable.refreshToken);
    assert.equal(rotated.expiresAt.getTime(), durable.expiresAt.getTime());
    const child = await runNode(process.execPath, ["--import", "tsx", "-e", "const {SessionService}=require('./src/services/sessionService'); const pool=require('./src/db').default; SessionService.rotateRefreshToken(process.env.TEST_REFRESH_TOKEN).then(s=>{if(s.sessionId!==process.env.TEST_SESSION_ID) throw Error('Wrong session'); console.log('Session restored from new process');}).finally(()=>pool.end()).catch(()=>{process.exitCode=1});"], { env: { ...process.env, TEST_REFRESH_TOKEN: rotated.refreshToken, TEST_SESSION_ID: rotated.sessionId } });
    assert.match(child.stdout, /Session restored from new process/);
    console.log("PASS: database persistence, hashes only, row locks, concurrent replay and fixed expiry");

    // Exercise representative base-table constraints and FK relationships.
    const [student] = await pool.execute<mysql.ResultSetHeader>("INSERT INTO students (first_name,last_name,date_of_birth,grade_level) VALUES ('Test','Student','2015-01-01','1')");
    await pool.execute("INSERT INTO attendance (student_id,date,status) VALUES (?, '2026-10-17', 'PRESENT')", [student.insertId]);
    await assert.rejects(pool.execute("INSERT INTO attendance (student_id,date,status) VALUES (?, '2026-10-17', 'ABSENT')", [student.insertId]), { code: "ER_DUP_ENTRY" });
    assert.ok(splitMigrationSql(baseline).length >= 5);
    console.log("PASS: attendance uniqueness enforced by MySQL");

    const {PushService}=await import('../../src/services/pushService');
    const {NotificationService}=await import('../../src/services/notificationService');
    const {CommentService}=await import('../../src/services/commentService');
    const {ChatService}=await import('../../src/services/chatService');
    const vapid=webPush.generateVAPIDKeys();
    process.env.WEB_PUSH_PUBLIC_KEY=vapid.publicKey;process.env.WEB_PUSH_PRIVATE_KEY=vapid.privateKey;process.env.WEB_PUSH_SUBJECT='https://example.test';
    const [admins]=await pool.query<RowDataPacket[]>("SELECT * FROM users WHERE role='admin' LIMIT 1");
    const staff=admins[0],staffSession=await SessionService.createSession(staff.id),parentSession=await SessionService.createSession(userId);
    const staffToken=JwtService.generateAccessToken({userId:staff.id,username:staff.username,email:staff.email,role:staff.role,sid:staffSession.sessionId});
    const parentToken=JwtService.generateAccessToken({userId,username:'integration-parent',email:'parent@example.test',role:'parent',sid:parentSession.sessionId});
    await pool.execute('INSERT INTO parent_students(user_id,student_id) VALUES (?,?)',[userId,student.insertId]);
    const subscription=(name:string)=>({endpoint:`https://fcm.googleapis.com/fcm/send/integration-${name}`,keys:{p256dh:webPush.generateVAPIDKeys().publicKey,auth:randomBytes(16).toString('base64url')}});
    assert.equal((await call('/push/subscription',subscription('staff'),undefined,staffToken)).status,200);
    assert.equal((await call('/push/subscription',subscription('parent'),undefined,parentToken)).status,200);
    const messageBody={content:'A private parent message',date:'2026-10-17',clientMessageId:randomUUID()};
    const first=await call(`/chat/${student.insertId}/messages`,messageBody,undefined,parentToken);
    assert.equal(first.status,201,JSON.stringify(first.body));
    const repeated=await call(`/chat/${student.insertId}/messages`,messageBody,undefined,parentToken);
    assert.equal(repeated.status,201);assert.equal(repeated.body.data.id,first.body.data.id);
    const conflict=await call(`/chat/${student.insertId}/messages`,{...messageBody,content:'different'},undefined,parentToken);
    assert.equal(conflict.status,409);
    const directReply=await call(`/chat/${student.insertId}/messages`,{...messageBody,parentCommentId:first.body.data.id,clientMessageId:randomUUID(),content:'A quoted reply'},undefined,parentToken);
    assert.equal(directReply.status,201);assert.equal(directReply.body.data.date,messageBody.date);
    const readAck=await fetch(`${base}/chat/${student.insertId}/read`,{method:'PATCH',headers:{...csrf,Authorization:`Bearer ${staffToken}`},body:JSON.stringify({throughId:directReply.body.data.id})});assert.equal(readAck.status,200);
    const duplicateBody={...messageBody,clientMessageId:randomUUID(),content:'Concurrent retry'};
    const concurrent=await Promise.all([call(`/chat/${student.insertId}/messages`,duplicateBody,undefined,parentToken),call(`/chat/${student.insertId}/messages`,duplicateBody,undefined,parentToken)]);
    assert.deepEqual(concurrent.map(r=>r.status),[201,201]);assert.equal(concurrent[0].body.data.id,concurrent[1].body.data.id);
    const counts=async()=>{
      const [rows]=await pool!.query<RowDataPacket[]>("SELECT (SELECT COUNT(*) FROM student_comments) AS messages,(SELECT COUNT(*) FROM notifications) AS notifications,(SELECT COUNT(*) FROM push_deliveries) AS jobs");return rows[0];
    };
    assert.deepEqual({...await counts()},{messages:3,notifications:3,jobs:3});
    const inbox=await call('/chat/conversations',undefined,undefined,staffToken);
    assert.equal(inbox.status,200);assert.equal(inbox.body.data.conversations[0].unreadCount,1);
    assert.equal(inbox.body.data.conversations[0].studentId,student.insertId);
    console.log('PASS: parent-initiated chat, conversation inbox, idempotent and concurrent sends');

    await pool.query("CREATE TRIGGER integration_reject_notice BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='integration failure'");
    const beforeFailure={...await counts()};
    const failed=await call(`/chat/${student.insertId}/messages`,{...messageBody,clientMessageId:randomUUID()},undefined,parentToken);
    assert.equal(failed.status,503);assert.deepEqual({...await counts()},beforeFailure);
    await pool.query('DROP TRIGGER integration_reject_notice');
    console.log('PASS: a failed notification insert rolls back message, inbox and push jobs');

    const reply=await call('/comments',{studentId:student.insertId,parentCommentId:first.body.data.id,date:messageBody.date,content:'Staff reply',clientMessageId:randomUUID()},undefined,staffToken);
    assert.equal(reply.status,201,JSON.stringify(reply.body));
    const received:Record<string,unknown>[]=[];
    let failPush=true;
    const sender=mock.method(PushService,'sendNotification',async(_subscription:unknown,payload?:string|Buffer|null)=>{
      if(failPush)throw Object.assign(new Error('Simulated push outage'),{statusCode:503});
      received.push(JSON.parse(String(payload)));return {statusCode:201,headers:{},body:''};
    });
    try{
      await PushService.processBatch();
      const [pending]=await pool.query<RowDataPacket[]>("SELECT * FROM push_deliveries WHERE status='pending'");
      assert.equal(pending.length,2);assert.ok(pending.every(row=>row.attempts===1&&row.last_error==='HTTP_503'));
      failPush=false;await pool.query("UPDATE push_deliveries SET available_at=CURRENT_TIMESTAMP(3) WHERE status='pending'");
      await pool.execute("UPDATE push_deliveries SET status='processing',locked_at=DATE_SUB(CURRENT_TIMESTAMP(3),INTERVAL 6 MINUTE) WHERE id=?",[pending[0].id]);
      await Promise.all([PushService.processBatch(),PushService.processBatch()]);assert.equal(received.length,2);
      assert.ok(received.every(payload=>payload.body==='Imate novu poruku u aplikaciji.'&&!JSON.stringify(payload).includes('private parent')));
      assert.ok(received.some(payload=>payload.binding===parentSession.sessionId));
      const [sent]=await pool.query<RowDataPacket[]>("SELECT * FROM push_deliveries WHERE status='sent'");assert.equal(sent.length,2);
      await PushService.processBatch();assert.equal(received.length,2,'sent jobs must not be resent');

      await ChatService.markRead(student.insertId,staff.id,concurrent[0].body.data.id);
      assert.equal(await NotificationService.getUnreadCount(staff.id),0);
      const notice=(await NotificationService.getUserNotifications(userId))[0];assert.ok(notice);
      assert.equal(await NotificationService.markAsRead(notice.id,userId),true);
      assert.equal(await NotificationService.getUnreadCount(userId),0);
      const another=await ChatService.send({studentId:student.insertId,authorId:staff.id,authorRole:'admin',content:'Next staff message',date:messageBody.date,clientMessageId:randomUUID()});
      await SessionService.revokeSession(parentSession.sessionId,userId);
      await PushService.processBatch();assert.equal(received.length,2,'revoked sessions must not receive pending push');
      const [cancelled]=await pool.query<RowDataPacket[]>("SELECT id FROM push_deliveries WHERE status='cancelled'");assert.equal(cancelled.length,3);

      // Expired provider subscriptions must be removed, not retried forever.
      await ChatService.send({studentId:student.insertId,authorId:userId,authorRole:'parent',content:'Expired provider subscription',date:messageBody.date,clientMessageId:randomUUID()});
      sender.mock.mockImplementation(async()=>{throw Object.assign(new Error('Gone'),{statusCode:410});});
      await PushService.processBatch();
      const [remaining]=await pool.execute<RowDataPacket[]>('SELECT id FROM push_subscriptions WHERE user_id=?',[staff.id]);assert.equal(remaining.length,0);
      await CommentService.deleteComment(first.body.data.id,userId);
      const [thread]=await pool.execute<RowDataPacket[]>('SELECT id FROM student_comments WHERE parent_comment_id=?',[first.body.data.id]);assert.equal(thread.length,2,'soft deletion must preserve replies');
      assert.ok((await CommentService.getCommentById(first.body.data.id)).deletedAt);
      await pool.execute('DELETE FROM parent_students WHERE user_id=? AND student_id=?',[userId,student.insertId]);
      assert.equal(await NotificationService.getById(notice.id,userId),null);
      await assert.rejects(ChatService.send({studentId:student.insertId,authorId:userId,authorRole:'parent',content:'No access',date:messageBody.date,clientMessageId:randomUUID()}));
      assert.equal((await call(`/chat/${student.insertId}/messages`,undefined,undefined,parentToken)).status,401);
      assert.ok(another.id>reply.body.data.id);
    }finally{sender.mock.restore();}
    console.log('PASS: durable push retries, generic encrypted payloads, read markers, revoked sessions, provider410 cleanup and soft deletion');

    for(let i=0;i<55;i++)await pool.execute("INSERT INTO student_comments(student_id,author_id,author_role,content,date) VALUES (?,?,'admin',?,'2026-10-17')",[student.insertId,staff.id,`Page ${i}`]);
    const page1=await ChatService.messages(student.insertId,{limit:50});const page2=await ChatService.messages(student.insertId,{limit:50,before:page1.nextCursor!});
    assert.equal(page1.messages.length,50);assert.ok(page1.hasMore);assert.ok(page2.messages.length>0);
    assert.equal(new Set([...page1.messages,...page2.messages].map(message=>message.id)).size,page1.messages.length+page2.messages.length);
    assert.ok(page2.messages[page2.messages.length-1].id<page1.messages[0].id);
    console.log('PASS: stable cursor pagination without missing or duplicated messages');
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (pool) await pool.end();
    if (verified) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
    await rm(migrationDir, { recursive: true, force: true });
  }
});

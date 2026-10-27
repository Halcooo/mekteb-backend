import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PoolConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { MigrationSystem, migrationChecksum, splitMigrationSql } from "../src/utils/MigrationSystem";

const BASELINE = "000_create_core_tables.sql";
const BASE_SQL = "-- A deliberately long header for legacy checksum collision tests\nCREATE TABLE users (id INT);";
interface Attempt { id: number; filename: string; checksum: string; status: string; completed_statements: number }

async function fixture(t: TestContext, files: Record<string, string> = { [BASELINE]: BASE_SQL }) {
  const prefix = path.join(tmpdir(), "mekteb-migration-tests-");
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(prefix)));
    await rm(resolved, { recursive: true, force: true });
  });
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(directory, name), content);
  const state = {
    tables: new Set<string>(), applied: new Map<string, string>(), attempts: [] as Attempt[],
    calls: [] as { sql: string; values: unknown[] }[], lockAvailable: true,
    failSql: "", releases: 0, lockReleases: 0,
  };
  const connection = {
    async execute(sql: string, values: unknown[] = []): Promise<[unknown, unknown[]]> {
      state.calls.push({ sql, values });
      if (sql === "SELECT DATABASE() AS name") return [[{ name: "isolated_migration_fixture" }], []];
      if (sql.startsWith("SELECT GET_LOCK")) return [[{ acquired: state.lockAvailable ? 1 : 0 }], []];
      if (sql.startsWith("SELECT RELEASE_LOCK")) { state.lockReleases++; return [[{ released: 1 }], []]; }
      if (sql.includes("information_schema.TABLES")) return [[...state.tables].map((name) => ({ name, engine: "InnoDB" })), []];
      if (sql.includes("information_schema.")) return [[], []];
      if (sql.startsWith("SELECT filename, checksum FROM migrations")) return [[...state.applied].map(([filename, checksum]) => ({ filename, checksum })), []];
      if (sql.startsWith("SELECT id, filename, checksum")) return [state.attempts.filter((attempt) => ["running", "failed"].includes(attempt.status)).map((attempt) => ({ ...attempt })), []];
      if (state.failSql && sql.includes(state.failSql)) throw Object.assign(new Error("sensitive SQL text must not escape"), { code: "ER_TEST_DDL" });
      if (sql.startsWith("CREATE TABLE")) {
        state.tables.add(sql.match(/^CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/)![1]);
        return [{ affectedRows: 0 }, []];
      }
      if (sql.startsWith("INSERT INTO migration_attempts")) {
        const id = state.attempts.length + 1;
        state.attempts.push({ id, filename: String(values[0]), checksum: String(values[1]), status: "running", completed_statements: 0 });
        return [{ insertId: id }, []];
      }
      if (sql.startsWith("INSERT INTO migrations")) { state.applied.set(String(values[0]), String(values[1])); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("UPDATE migrations SET checksum")) { state.applied.set(String(values[1]), String(values[0])); return [{ affectedRows: 1 }, []]; }
      if (sql.startsWith("UPDATE migration_attempts SET completed_statements")) state.attempts.find((attempt) => attempt.id === values[1])!.completed_statements = Number(values[0]);
      else if (sql.includes("SET status = 'applied'")) state.attempts.find((attempt) => attempt.id === values[0])!.status = "applied";
      else if (sql.includes("SET status = 'failed'")) {
        const attempt = state.attempts.find((entry) => entry.id === values[2])!;
        attempt.status = "failed"; attempt.completed_statements = Number(values[0]);
      } else if (sql.includes("SET status = 'resolved'")) {
        for (const attempt of state.attempts) if (attempt.filename === values[1] && ["running", "failed"].includes(attempt.status)) attempt.status = "resolved";
      } else throw new Error(`Unexpected fixture query: ${sql}`);
      return [{ affectedRows: 1 }, []];
    },
    release() { state.releases++; },
  } as unknown as PoolConnection;
  const system = new MigrationSystem({ getConnection: async () => connection }, directory);
  return { state, system, directory };
}

test("SQL splitting preserves quoted semicolons, escapes and identifiers, discards comments and rejects unsupported programs", () => {
  assert.deepEqual(splitMigrationSql("-- ignored;\nCREATE TABLE `semi;colon` (v TEXT DEFAULT 'a;''b'); /* ignored; */ INSERT INTO t VALUES ('c;d'); # tail\n"), [
    "CREATE TABLE `semi;colon` (v TEXT DEFAULT 'a;''b')", "INSERT INTO t VALUES ('c;d')",
  ]);
  assert.equal(splitMigrationSql("INSERT INTO t VALUES ('escaped\\\';still quoted'); SELECT 1;").length, 2);
  for (const invalid of ["SELECT 'unterminated", "/* unterminated", "DELIMITER $$\nSELECT 1", "CREATE TRIGGER t BEFORE INSERT ON users FOR EACH ROW SET @x=1", "/*! SET @x=1 */"]) {
    assert.throws(() => splitMigrationSql(invalid));
  }
});

test("checksums are full SHA-256, normalize deployment line endings, and detect changes beyond the old prefix", () => {
  assert.equal(migrationChecksum(BASE_SQL), createHash("sha256").update(BASE_SQL).digest("hex"));
  assert.equal(migrationChecksum(BASE_SQL.replace(/\n/g, "\r\n")), migrationChecksum(BASE_SQL));
  assert.notEqual(migrationChecksum(`${BASE_SQL}\nSELECT 2;`), migrationChecksum(BASE_SQL));
});

test("status is read-only even on an empty database", async (t) => {
  const { system, state } = await fixture(t);
  const status = await system.status();
  assert.deepEqual(status.pending, [BASELINE]);
  assert.deepEqual(status.issues, []);
  assert.ok(state.calls.every(({ sql }) => sql.startsWith("SELECT")));
  assert.equal(state.calls.some(({ sql }) => sql.includes("GET_LOCK")), false);
  assert.equal(state.releases, 1);
});

test("fresh database applies migrations in order under one lock and subsequent runs are idempotent", async (t) => {
  const { system, state } = await fixture(t, { "002_second.sql": "CREATE TABLE second (id INT);", [BASELINE]: BASE_SQL, "001_first.sql": "CREATE TABLE first (id INT);", "001_first.rollback.sql": "DROP TABLE first;" });
  assert.deepEqual(await system.runMigrations(), [BASELINE, "001_first.sql", "002_second.sql"]);
  assert.deepEqual(state.attempts.map((attempt) => attempt.status), ["applied", "applied", "applied"]);
  assert.equal(state.lockReleases, 1);
  const creations = state.calls.filter(({ sql }) => /^CREATE TABLE (users|first|second)/.test(sql));
  assert.equal(creations.length, 3);
  assert.deepEqual(await system.runMigrations(), []);
  assert.equal(state.calls.filter(({ sql }) => /^CREATE TABLE (users|first|second)/.test(sql)).length, 3);
  assert.equal(state.calls.some(({ sql }) => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql)), false);
});

test("existing databases cannot silently execute or adopt the baseline", async (t) => {
  const { system, state } = await fixture(t);
  state.tables.add("users");
  assert.equal((await system.status()).baselineAdoptionRequired, true);
  await assert.rejects(system.runMigrations(), /explicit.*baseline adoption/);
  await assert.rejects(system.adoptBaseline(false), /confirm-schema-reviewed/);
  await assert.rejects(system.adoptBaseline(true), /Baseline adoption refused/);
  assert.ok(state.calls.every(({ sql }) => sql.startsWith("SELECT")));
  assert.equal(state.applied.size, 0);
});

test("a competing migration lock stops all writes and always returns the connection", async (t) => {
  const { system, state } = await fixture(t);
  state.lockAvailable = false;
  await assert.rejects(system.runMigrations(), /advisory lock/);
  assert.ok(state.calls.every(({ sql }) => sql.startsWith("SELECT")));
  assert.equal(state.releases, 1);
  assert.equal(state.lockReleases, 0);
});

test("partial DDL failures persist progress, block automatic retry and require explicit manual recovery", async (t) => {
  const broken = "001_partial.sql";
  const { system, state } = await fixture(t, { [BASELINE]: BASE_SQL, [broken]: "CREATE TABLE first (id INT); CREATE TABLE fail_here (id INT);" });
  state.failSql = "CREATE TABLE fail_here";
  await assert.rejects(system.runMigrations(), (error: unknown) => error instanceof Error && /1\/2 statements.*ER_TEST_DDL/.test(error.message) && !error.message.includes("sensitive SQL"));
  assert.equal(state.tables.has("first"), true);
  assert.equal(state.applied.has(broken), false);
  assert.equal(state.attempts[1].status, "failed");
  assert.equal(state.attempts[1].completed_statements, 1);
  const writesBeforeRetry = state.calls.filter(({ sql }) => !sql.startsWith("SELECT")).length;
  await assert.rejects(system.runMigrations(), /Unresolved failed/);
  assert.equal(state.calls.filter(({ sql }) => !sql.startsWith("SELECT")).length, writesBeforeRetry);
  await assert.rejects(system.resolveFailedMigration(broken, "retry", false), /confirm-schema-restored/);
  // Simulate the operator restoring the pre-migration schema, then acknowledging it.
  state.tables.delete("first"); state.failSql = "";
  await system.resolveFailedMigration(broken, "retry", true);
  assert.deepEqual(await system.runMigrations(), [broken]);
});

test("interrupted running attempts can only be marked applied after explicit acknowledgement, without rerunning DDL", async (t) => {
  const interrupted = "001_interrupted.sql";
  const sql = "CREATE TABLE interrupted (id INT);";
  const { system, state } = await fixture(t, { [BASELINE]: BASE_SQL, [interrupted]: sql });
  state.tables.add("migrations"); state.tables.add("migration_attempts"); state.tables.add("users");
  state.applied.set(BASELINE, migrationChecksum(BASE_SQL));
  state.attempts.push({ id: 1, filename: interrupted, checksum: migrationChecksum(sql), status: "running", completed_statements: 0 });
  await assert.rejects(system.runMigrations(), /Unresolved running/);
  await system.resolveFailedMigration(interrupted, "applied", true);
  assert.equal(state.applied.get(interrupted), migrationChecksum(sql));
  assert.equal(state.attempts[0].status, "resolved");
  assert.equal(state.calls.some(({ sql }) => sql.startsWith("CREATE TABLE interrupted")), false);
});

test("legacy prefix checksums require explicit review and mismatched SHA checksums cannot be adopted", async (t) => {
  const { system, state, directory } = await fixture(t);
  state.tables.add("migrations"); state.tables.add("users");
  state.applied.set(BASELINE, Buffer.from(BASE_SQL).toString("base64").substring(0, 32));
  await assert.rejects(system.runMigrations(), /Legacy checksum/);
  await assert.rejects(system.adoptLegacyChecksums(false), /confirm-files-reviewed/);
  assert.deepEqual(await system.adoptLegacyChecksums(true), [BASELINE]);
  assert.equal(state.applied.get(BASELINE), migrationChecksum(BASE_SQL));
  await writeFile(path.join(directory, BASELINE), `${BASE_SQL}\nSELECT 2;`);
  await assert.rejects(system.runMigrations(), /Checksum mismatch/);
  await assert.rejects(system.adoptLegacyChecksums(true), /Checksum mismatch/);
});

test("missing applied files, out-of-order pending versions and duplicate versions fail before writes", async (t) => {
  const { system, state, directory } = await fixture(t, { [BASELINE]: BASE_SQL, "001_first.sql": "SELECT 1;", "002_second.sql": "SELECT 2;" });
  state.tables.add("migrations");
  state.applied.set(BASELINE, migrationChecksum(BASE_SQL));
  state.applied.set("002_second.sql", migrationChecksum("SELECT 2;"));
  await assert.rejects(system.runMigrations(), /Out-of-order/);
  state.applied.set("999_missing.sql", "a".repeat(64));
  await assert.rejects(system.runMigrations(), /file is missing/);
  await writeFile(path.join(directory, "001_duplicate.sql"), "SELECT 1;");
  await assert.rejects(system.status(), /duplicate migration version/);
  assert.ok(state.calls.every(({ sql }) => sql.startsWith("SELECT")));
});

test("automatic rollback is refused without contacting the database and CLI argument failures exit nonzero", async (t) => {
  const { system, state } = await fixture(t);
  await assert.rejects(system.rollbackLastMigration(), /not transactional/);
  assert.equal(state.calls.length, 0);
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.js", "invalid-command"], {
    cwd: path.resolve(__dirname, ".."), env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});

test("all repository migrations use supported SQL; baseline creates the five core tables without IF NOT EXISTS", async () => {
  const directory = path.resolve(__dirname, "../migrations");
  const baseline = await readFile(path.join(directory, BASELINE), "utf8");
  const statements = splitMigrationSql(baseline);
  assert.deepEqual(statements.map((statement) => statement.match(/^CREATE TABLE ([a-z_]+)/)?.[1]), ["users", "students", "attendance", "news", "news_images"]);
  assert.equal(baseline.includes("IF NOT EXISTS"), false);
  for (const file of ["001_create_student_comments_table.sql", "002_add_parent_key_to_students.sql", "003_create_parent_students_table.sql", "004_create_notifications_table.sql"]) assert.ok(splitMigrationSql(await readFile(path.join(directory, file), "utf8")).length > 0);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "mysql2/promise";
import bcrypt from "bcrypt";
import { createAdmin, readAdminInput } from "../src/utils/createAdmin";

const environment = {
  BOOTSTRAP_ADMIN_USERNAME: " owner ", BOOTSTRAP_ADMIN_EMAIL: " owner@example.test ",
  BOOTSTRAP_ADMIN_PASSWORD: "test-only-password-123", BOOTSTRAP_ADMIN_FIRST_NAME: " Test ",
  BOOTSTRAP_ADMIN_LAST_NAME: " Owner ",
};

test("administrator bootstrap has no default credentials and validates password byte limits", () => {
  assert.throws(() => readAdminInput({}), /BOOTSTRAP_ADMIN/);
  assert.throws(() => readAdminInput({ ...environment, BOOTSTRAP_ADMIN_PASSWORD: "short" }), /PASSWORD/);
  assert.throws(() => readAdminInput({ ...environment, BOOTSTRAP_ADMIN_PASSWORD: "é".repeat(37) }), /PASSWORD/);
  const input = readAdminInput(environment);
  assert.equal(input.username, "owner");
  assert.equal(input.firstName, "Test");
});

test("administrator bootstrap inserts a bcrypt hash with fixed admin role and never updates an existing user", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const pool = { execute: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return [{ insertId: 7 }, []]; } } as unknown as Pick<Pool, "execute">;
  assert.equal(await createAdmin(pool, readAdminInput(environment)), 7);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^INSERT INTO users.*'admin'/);
  assert.equal(calls[0].sql.includes("UPDATE"), false);
  const hash = String(calls[0].values[2]);
  assert.notEqual(hash, environment.BOOTSTRAP_ADMIN_PASSWORD);
  assert.equal(await bcrypt.compare(environment.BOOTSTRAP_ADMIN_PASSWORD, hash), true);
  assert.equal(bcrypt.getRounds(hash), 12);
  const duplicatePool = { execute: async () => { throw Object.assign(new Error("sensitive database detail"), { code: "ER_DUP_ENTRY" }); } } as unknown as Pick<Pool, "execute">;
  await assert.rejects(createAdmin(duplicatePool, readAdminInput(environment)), /was not changed/);
});

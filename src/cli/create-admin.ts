#!/usr/bin/env node
import { createAdmin, readAdminInput } from "../utils/createAdmin";
import { MigrationSystem } from "../utils/MigrationSystem";

async function main() {
  if (process.argv.length > 2) throw new Error("Pass administrator details through BOOTSTRAP_ADMIN_* environment variables, not command-line arguments");
  const input = readAdminInput(process.env);
  // Reduce accidental inheritance by any child process launched later.
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const { default: pool } = await import("../db");
  try {
    const status = await new MigrationSystem(pool).status();
    if (status.issues.length || status.pending.length) throw new Error("Complete and verify database migrations before creating an administrator");
    const id = await createAdmin(pool, input);
    console.log(`Created administrator account with ID ${id}. No existing account was changed.`);
  } finally {
    input.password = "";
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error?.code ? `Administrator creation failed (${error.code})` : error instanceof Error ? error.message : "Administrator creation failed");
  process.exitCode = 1;
});

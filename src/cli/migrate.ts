#!/usr/bin/env node
import { MigrationSystem } from "../utils/MigrationSystem";

const usage = `Usage: npm run migrate -- <command>
  status                                      Read-only schema/migration status
  up                                          Apply pending migrations
  legacy-plan                                 Read-only plan for the reviewed nine-table legacy schema
  upgrade-legacy --confirm-backup-restored --confirm-writes-paused
                                              Upgrade legacy constraints and verify/adopt 000..004
  adopt-baseline --confirm-schema-reviewed     Verify existing core schema and record baseline
  adopt-legacy-checksums --confirm-files-reviewed
                                              Adopt legacy prefix checksums after file review
  resolve <filename> --applied --confirm-schema-reviewed
                                              Record a manually verified completed migration
  resolve <filename> --retry --confirm-schema-restored
                                              Permit retry after manual restoration
Automatic rollback is disabled; restore a verified backup or use a forward migration.`;

async function main() {
  const [command = "status", ...args] = process.argv.slice(2);
  if (command === "help" || command === "--help") { console.log(usage); return; }
  const exact = (...expected: string[]) => args.length === expected.length && expected.every((value, index) => args[index] === value);
  const valid = ((command === "status" || command === "up" || command === "rollback" || command === "legacy-plan") && exact()) ||
    (command === "upgrade-legacy" && exact('--confirm-backup-restored','--confirm-writes-paused')) ||
    (command === "adopt-baseline" && exact("--confirm-schema-reviewed")) ||
    (command === "adopt-legacy-checksums" && exact("--confirm-files-reviewed")) ||
    (command === "resolve" && args.length === 3 && /^\d{3}_[a-z0-9_]+\.sql$/.test(args[0]) &&
      ((args[1] === "--applied" && args[2] === "--confirm-schema-reviewed") ||
       (args[1] === "--retry" && args[2] === "--confirm-schema-restored")));
  if (!valid) throw new Error(usage);
  if (command === "rollback") throw new Error("Automatic rollback is disabled. Restore a verified backup or write a reviewed forward migration.");

  // Import configuration only after validating an explicitly selected operation.
  const { default: pool } = await import("../db");
  try {
    const system = new MigrationSystem(pool);
    if (command === 'legacy-plan') {
      console.log(JSON.stringify({statements:await system.legacyUpgradePlan(),readOnly:true},null,2));
    } else if(command === 'upgrade-legacy') {
      console.log(JSON.stringify(await system.upgradeLegacySchema(true,true),null,2));
    } else if (command === "status") {
      const status = await system.status();
      console.log(JSON.stringify(status, null, 2));
      if (status.issues.length) process.exitCode = 1;
    } else if (command === "up") {
      console.log(JSON.stringify({ applied: await system.runMigrations() }, null, 2));
    } else if (command === "adopt-baseline") {
      await system.adoptBaseline(true);
      console.log("Baseline schema verified and recorded. Existing application data was not changed.");
    } else if (command === "adopt-legacy-checksums") {
      console.log(JSON.stringify({ adoptedChecksums: await system.adoptLegacyChecksums(true) }, null, 2));
    } else {
      await system.resolveFailedMigration(args[0], args[1] === "--applied" ? "applied" : "retry", true);
      console.log("Migration attempt resolved. Run status before continuing.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // Driver messages may contain SQL/data. Print only the driver code, if present.
  console.error(error?.code ? `Migration command failed (${error.code})` : error instanceof Error ? error.message : "Migration command failed");
  process.exitCode = 1;
});

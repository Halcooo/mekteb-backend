#!/usr/bin/env node

import { MigrationSystem } from "../src/utils/MigrationSystem.js";
import pool from "../src/db.js";

async function runMigrations() {
  const migrationSystem = new MigrationSystem(pool);

  const command = process.argv[2];

  try {
    switch (command) {
      case "up":
      case undefined:
        console.log("🚀 Running database migrations...");
        await migrationSystem.runMigrations();
        break;

      case "rollback":
        console.log("⚠️  Rolling back last migration...");
        await migrationSystem.rollbackLastMigration();
        break;

      case "status":
        await migrationSystem.initMigrations();
        const pending = await migrationSystem.getPendingMigrations();
        const executed = await migrationSystem.getExecutedMigrations();

        console.log(`📊 Migration Status:`);
        console.log(`   Executed: ${executed.size}`);
        console.log(`   Pending: ${pending.length}`);

        if (pending.length > 0) {
          console.log(`\n📦 Pending migrations:`);
          pending.forEach((migration) => console.log(`   - ${migration}`));
        }
        break;

      default:
        console.log(`
Usage: npm run migrate [command]

Commands:
  up (default)  Run all pending migrations
  rollback      Rollback the last migration
  status        Show migration status

Examples:
  npm run migrate
  npm run migrate up
  npm run migrate rollback
  npm run migrate status
        `);
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigrations();

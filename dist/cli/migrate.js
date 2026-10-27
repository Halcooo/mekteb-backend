#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const MigrationSystem_1 = require("../utils/MigrationSystem");
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
    if (command === "help" || command === "--help") {
        console.log(usage);
        return;
    }
    const exact = (...expected) => args.length === expected.length && expected.every((value, index) => args[index] === value);
    const valid = ((command === "status" || command === "up" || command === "rollback" || command === "legacy-plan") && exact()) ||
        (command === "upgrade-legacy" && exact('--confirm-backup-restored', '--confirm-writes-paused')) ||
        (command === "adopt-baseline" && exact("--confirm-schema-reviewed")) ||
        (command === "adopt-legacy-checksums" && exact("--confirm-files-reviewed")) ||
        (command === "resolve" && args.length === 3 && /^\d{3}_[a-z0-9_]+\.sql$/.test(args[0]) &&
            ((args[1] === "--applied" && args[2] === "--confirm-schema-reviewed") ||
                (args[1] === "--retry" && args[2] === "--confirm-schema-restored")));
    if (!valid)
        throw new Error(usage);
    if (command === "rollback")
        throw new Error("Automatic rollback is disabled. Restore a verified backup or write a reviewed forward migration.");
    // Import configuration only after validating an explicitly selected operation.
    const { default: pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    try {
        const system = new MigrationSystem_1.MigrationSystem(pool);
        if (command === 'legacy-plan') {
            console.log(JSON.stringify({ statements: await system.legacyUpgradePlan(), readOnly: true }, null, 2));
        }
        else if (command === 'upgrade-legacy') {
            console.log(JSON.stringify(await system.upgradeLegacySchema(true, true), null, 2));
        }
        else if (command === "status") {
            const status = await system.status();
            console.log(JSON.stringify(status, null, 2));
            if (status.issues.length)
                process.exitCode = 1;
        }
        else if (command === "up") {
            console.log(JSON.stringify({ applied: await system.runMigrations() }, null, 2));
        }
        else if (command === "adopt-baseline") {
            await system.adoptBaseline(true);
            console.log("Baseline schema verified and recorded. Existing application data was not changed.");
        }
        else if (command === "adopt-legacy-checksums") {
            console.log(JSON.stringify({ adoptedChecksums: await system.adoptLegacyChecksums(true) }, null, 2));
        }
        else {
            await system.resolveFailedMigration(args[0], args[1] === "--applied" ? "applied" : "retry", true);
            console.log("Migration attempt resolved. Run status before continuing.");
        }
    }
    finally {
        await pool.end();
    }
}
main().catch((error) => {
    // Driver messages may contain SQL/data. Print only the driver code, if present.
    console.error(error?.code ? `Migration command failed (${error.code})` : error instanceof Error ? error.message : "Migration command failed");
    process.exitCode = 1;
});

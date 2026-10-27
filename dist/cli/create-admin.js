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
const createAdmin_1 = require("../utils/createAdmin");
const MigrationSystem_1 = require("../utils/MigrationSystem");
async function main() {
    if (process.argv.length > 2)
        throw new Error("Pass administrator details through BOOTSTRAP_ADMIN_* environment variables, not command-line arguments");
    const input = (0, createAdmin_1.readAdminInput)(process.env);
    // Reduce accidental inheritance by any child process launched later.
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const { default: pool } = await Promise.resolve().then(() => __importStar(require("../db")));
    try {
        const status = await new MigrationSystem_1.MigrationSystem(pool).status();
        if (status.issues.length || status.pending.length)
            throw new Error("Complete and verify database migrations before creating an administrator");
        const id = await (0, createAdmin_1.createAdmin)(pool, input);
        console.log(`Created administrator account with ID ${id}. No existing account was changed.`);
    }
    finally {
        input.password = "";
        await pool.end();
    }
}
main().catch((error) => {
    console.error(error?.code ? `Administrator creation failed (${error.code})` : error instanceof Error ? error.message : "Administrator creation failed");
    process.exitCode = 1;
});

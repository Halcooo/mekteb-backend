"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationSystem = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const __filename = path_1.default.resolve();
const __dirname = path_1.default.dirname(__filename);
// Migration system for MySQL database
class MigrationSystem {
    constructor(pool) {
        this.pool = pool;
        this.migrationsDir = path_1.default.join(__dirname, "../../migrations");
    }
    // Initialize migrations table
    async initMigrations() {
        const createMigrationsTableQuery = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        checksum VARCHAR(255) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
        await this.pool.execute(createMigrationsTableQuery);
        console.log("✅ Migrations table initialized");
    }
    // Get executed migrations
    async getExecutedMigrations() {
        const [rows] = await this.pool.execute("SELECT filename FROM migrations ORDER BY executed_at");
        return new Set(rows.map((row) => row.filename));
    }
    // Get pending migrations
    async getPendingMigrations() {
        const executed = await this.getExecutedMigrations();
        const files = await promises_1.default.readdir(this.migrationsDir);
        const migrationFiles = files
            .filter((file) => file.endsWith(".sql") && !file.includes(".rollback."))
            .sort();
        return migrationFiles.filter((file) => !executed.has(file));
    }
    // Execute a single migration
    async executeMigration(filename) {
        const filePath = path_1.default.join(this.migrationsDir, filename);
        const sql = await promises_1.default.readFile(filePath, "utf-8");
        // Calculate checksum for integrity
        const checksum = this.calculateChecksum(sql);
        // Begin transaction
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            // Split and execute SQL statements
            const statements = sql
                .split(";")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            for (const statement of statements) {
                if (statement.trim()) {
                    await connection.execute(statement);
                }
            }
            // Record migration as executed
            await connection.execute("INSERT INTO migrations (filename, checksum) VALUES (?, ?)", [filename, checksum]);
            await connection.commit();
            console.log(`✅ Migration executed: ${filename}`);
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    // Run all pending migrations
    async runMigrations() {
        await this.initMigrations();
        const pending = await this.getPendingMigrations();
        if (pending.length === 0) {
            console.log("✅ No pending migrations");
            return;
        }
        console.log(`📦 Found ${pending.length} pending migration(s)`);
        for (const migration of pending) {
            await this.executeMigration(migration);
        }
        console.log("✅ All migrations completed successfully");
    }
    // Calculate checksum for migration integrity
    calculateChecksum(content) {
        return Buffer.from(content).toString("base64").substring(0, 32);
    }
    // Rollback last migration (use with caution!)
    async rollbackLastMigration() {
        const [rows] = (await this.pool.execute("SELECT * FROM migrations ORDER BY executed_at DESC LIMIT 1"));
        if (rows.length === 0) {
            console.log("No migrations to rollback");
            return;
        }
        const lastMigration = rows[0];
        console.log(`⚠️  Rolling back migration: ${lastMigration.filename}`);
        // Look for rollback file
        const rollbackFile = lastMigration.filename.replace(".sql", ".rollback.sql");
        const rollbackPath = path_1.default.join(this.migrationsDir, rollbackFile);
        try {
            const rollbackSql = await promises_1.default.readFile(rollbackPath, "utf-8");
            const connection = await this.pool.getConnection();
            try {
                await connection.beginTransaction();
                // Execute rollback statements
                const statements = rollbackSql
                    .split(";")
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0);
                for (const statement of statements) {
                    if (statement.trim()) {
                        await connection.execute(statement);
                    }
                }
                // Remove migration record
                await connection.execute("DELETE FROM migrations WHERE filename = ?", [
                    lastMigration.filename,
                ]);
                await connection.commit();
                console.log(`✅ Rollback completed: ${lastMigration.filename}`);
            }
            catch (error) {
                await connection.rollback();
                throw error;
            }
            finally {
                connection.release();
            }
        }
        catch (error) {
            if (error.code === "ENOENT") {
                console.error(`❌ Rollback file not found: ${rollbackFile}`);
            }
            else {
                throw error;
            }
        }
    }
}
exports.MigrationSystem = MigrationSystem;

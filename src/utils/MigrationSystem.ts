import mysql from "mysql2/promise";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration system for MySQL database
export class MigrationSystem {
  private pool: mysql.Pool;
  private migrationsDir: string;

  constructor(pool: mysql.Pool) {
    this.pool = pool;
    this.migrationsDir = path.join(__dirname, "../../migrations");
  }

  // Initialize migrations table
  async initMigrations(): Promise<void> {
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
  async getExecutedMigrations(): Promise<Set<string>> {
    const [rows] = await this.pool.execute(
      "SELECT filename FROM migrations ORDER BY executed_at"
    );
    return new Set((rows as any[]).map((row) => row.filename));
  }

  // Get pending migrations
  async getPendingMigrations(): Promise<string[]> {
    const executed = await this.getExecutedMigrations();
    const files = await fs.readdir(this.migrationsDir);

    const migrationFiles = files
      .filter((file) => file.endsWith(".sql") && !file.includes(".rollback."))
      .sort();

    return migrationFiles.filter((file) => !executed.has(file));
  }

  // Execute a single migration
  async executeMigration(filename: string): Promise<void> {
    const filePath = path.join(this.migrationsDir, filename);
    const sql = await fs.readFile(filePath, "utf-8");

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
      await connection.execute(
        "INSERT INTO migrations (filename, checksum) VALUES (?, ?)",
        [filename, checksum]
      );

      await connection.commit();
      console.log(`✅ Migration executed: ${filename}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Run all pending migrations
  async runMigrations(): Promise<void> {
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
  private calculateChecksum(content: string): string {
    return Buffer.from(content).toString("base64").substring(0, 32);
  }

  // Rollback last migration (use with caution!)
  async rollbackLastMigration(): Promise<void> {
    const [rows] = (await this.pool.execute(
      "SELECT * FROM migrations ORDER BY executed_at DESC LIMIT 1"
    )) as any[];

    if (rows.length === 0) {
      console.log("No migrations to rollback");
      return;
    }

    const lastMigration = rows[0];
    console.log(`⚠️  Rolling back migration: ${lastMigration.filename}`);

    // Look for rollback file
    const rollbackFile = lastMigration.filename.replace(
      ".sql",
      ".rollback.sql"
    );
    const rollbackPath = path.join(this.migrationsDir, rollbackFile);

    try {
      const rollbackSql = await fs.readFile(rollbackPath, "utf-8");

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
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      if ((error as any).code === "ENOENT") {
        console.error(`❌ Rollback file not found: ${rollbackFile}`);
      } else {
        throw error;
      }
    }
  }
}

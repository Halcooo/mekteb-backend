"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationSystem = void 0;
exports.migrationChecksum = migrationChecksum;
exports.splitMigrationSql = splitMigrationSql;
exports.migrationRows = migrationRows;
const node_crypto_1 = require("node:crypto");
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const baselineSchema_1 = require("./baselineSchema");
const legacyUpgrade_1 = require("./legacyUpgrade");
const BASELINE = "000_create_core_tables.sql";
const METADATA_TABLES = ["migrations", "migration_attempts"];
/** Canonical line endings make SHA-256 checksums identical on Windows/Linux. */
function migrationChecksum(sql) {
    return (0, node_crypto_1.createHash)("sha256").update(sql.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")).digest("hex");
}
/** Split plain SQL without breaking quoted semicolons or comments. */
function splitMigrationSql(sql) {
    const statements = [];
    let current = "", quote = "";
    let lineComment = false, blockComment = false;
    for (let i = 0; i < sql.length; i++) {
        const c = sql[i], next = sql[i + 1];
        if (lineComment) {
            if (c === "\n") {
                lineComment = false;
                current += "\n";
            }
            continue;
        }
        if (blockComment) {
            if (c === "*" && next === "/") {
                blockComment = false;
                current += " ";
                i++;
            }
            continue;
        }
        if (quote) {
            current += c;
            if (c === "\\" && next !== undefined) {
                current += next;
                i++;
            }
            else if (c === quote) {
                if (next === quote) {
                    current += next;
                    i++;
                }
                else
                    quote = "";
            }
            continue;
        }
        if (c === "'" || c === '"' || c === "`") {
            quote = c;
            current += c;
        }
        else if (c === "#" || (c === "-" && next === "-" && /\s/.test(sql[i + 2] ?? ""))) {
            lineComment = true;
            current += " ";
        }
        else if (c === "/" && next === "*") {
            if (sql[i + 2] === "!")
                throw new Error("Executable MySQL comments are not supported in migrations");
            blockComment = true;
            i++;
            current += " ";
        }
        else if (c === ";") {
            if (current.trim())
                statements.push(current.trim());
            current = "";
        }
        else
            current += c;
    }
    if (quote || blockComment)
        throw new Error("Unterminated SQL quote or block comment");
    if (current.trim())
        statements.push(current.trim());
    if (statements.some((statement) => /^DELIMITER\b|^CREATE\s+(?:DEFINER\s*=.*?\s+)?(?:PROCEDURE|FUNCTION|TRIGGER|EVENT)\b/i.test(statement))) {
        throw new Error("Stored programs and custom DELIMITER statements are not supported");
    }
    return statements;
}
async function migrationRows(connection, sql, values = []) {
    const [rows] = await connection.execute(sql, values);
    return rows;
}
class MigrationSystem {
    constructor(pool, migrationsDir = node_path_1.default.resolve(process.cwd(), "migrations")) {
        this.pool = pool;
        this.migrationsDir = migrationsDir;
    }
    async files() {
        const names = (await promises_1.default.readdir(this.migrationsDir)).filter((name) => name.endsWith(".sql") && !name.endsWith(".rollback.sql")).sort();
        const versions = new Set();
        return Promise.all(names.map(async (filename) => {
            if (!/^\d{3}_[a-z0-9_]+\.sql$/.test(filename) || versions.has(filename.slice(0, 3)))
                throw new Error(`Invalid or duplicate migration version: ${filename}`);
            versions.add(filename.slice(0, 3));
            const sql = await promises_1.default.readFile(node_path_1.default.join(this.migrationsDir, filename), "utf8");
            const statements = splitMigrationSql(sql);
            if (!statements.length)
                throw new Error(`Empty migration: ${filename}`);
            return { filename, sql, checksum: migrationChecksum(sql), statements };
        }));
    }
    async readState(connection, files) {
        const tables = await migrationRows(connection, "SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
        const names = new Set(tables.map((table) => table.name));
        const applied = names.has("migrations") ? await migrationRows(connection, "SELECT filename, checksum FROM migrations ORDER BY filename") : [];
        const unresolved = names.has("migration_attempts") ? await migrationRows(connection, "SELECT id, filename, checksum, status, completed_statements FROM migration_attempts WHERE status IN ('running', 'failed') ORDER BY id") : [];
        const issues = [];
        const appliedNames = new Set(applied.map((entry) => entry.filename));
        for (const entry of applied) {
            const file = files.find((candidate) => candidate.filename === entry.filename);
            if (!file)
                issues.push(`Applied migration file is missing: ${entry.filename}`);
            else if (entry.checksum !== file.checksum) {
                const legacy = Buffer.from(file.sql).toString("base64").substring(0, 32);
                issues.push(entry.checksum === legacy ? `Legacy checksum requires explicit adoption: ${entry.filename}` : `Checksum mismatch: ${entry.filename}`);
            }
        }
        const pending = files.filter((file) => !appliedNames.has(file.filename)).map((file) => file.filename);
        const baselineAdoptionRequired = !appliedNames.has(BASELINE) && (applied.length > 0 || tables.some((table) => !METADATA_TABLES.includes(table.name)));
        if (!files.some((file) => file.filename === BASELINE))
            issues.push("Baseline migration file is missing");
        if (baselineAdoptionRequired)
            issues.push("Existing application tables require explicit schema-checked baseline adoption");
        for (const attempt of unresolved)
            issues.push(`Unresolved ${attempt.status} migration: ${attempt.filename} (${attempt.completed_statements} statements recorded complete)`);
        for (const name of pending)
            if (name !== BASELINE && applied.some((entry) => entry.filename > name))
                issues.push(`Out-of-order pending migration: ${name}`);
        return { tables, applied, status: { applied: applied.map((entry) => entry.filename), pending, issues, unresolved, baselineAdoptionRequired } };
    }
    /** Pure database reads: never creates metadata, including on an empty DB. */
    async status() {
        const files = await this.files(), connection = await this.pool.getConnection();
        try {
            return (await this.readState(connection, files)).status;
        }
        finally {
            connection.release();
        }
    }
    async getExecutedMigrations() { return new Set((await this.status()).applied); }
    async getPendingMigrations() { return (await this.status()).pending; }
    async withLock(run) {
        const connection = await this.pool.getConnection();
        let lockName, locked = false;
        try {
            const database = (await migrationRows(connection, "SELECT DATABASE() AS name"))[0]?.name;
            if (!database)
                throw new Error("A database must be selected before running migrations");
            lockName = `mekteb:migrate:${(0, node_crypto_1.createHash)("sha256").update(database).digest("hex").slice(0, 40)}`;
            locked = Number((await migrationRows(connection, "SELECT GET_LOCK(?, 0) AS acquired", [lockName]))[0]?.acquired) === 1;
            if (!locked)
                throw new Error("Another migration process holds the database advisory lock");
            return await run(connection);
        }
        finally {
            try {
                if (locked && lockName)
                    await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
            }
            finally {
                connection.release();
            }
        }
    }
    async initializeMetadata(connection) {
        await connection.execute(`CREATE TABLE IF NOT EXISTS migrations (
      id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, checksum VARCHAR(255) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await connection.execute(`CREATE TABLE IF NOT EXISTS migration_attempts (
      id INT AUTO_INCREMENT PRIMARY KEY, filename VARCHAR(255) NOT NULL, checksum CHAR(64) NOT NULL,
      status ENUM('running','failed','applied','resolved') NOT NULL,
      completed_statements INT NOT NULL DEFAULT 0, error_code VARCHAR(64) NULL,
      resolution VARCHAR(30) NULL, started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TIMESTAMP NULL, INDEX idx_attempt_status (status, filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    }
    async applyFile(connection, file) {
        const [result] = await connection.execute("INSERT INTO migration_attempts (filename, checksum, status) VALUES (?, ?, 'running')", [file.filename, file.checksum]);
        const attemptId = result.insertId;
        let completed = 0;
        try {
            // MySQL DDL commits implicitly; a transaction cannot undo these statements.
            for (const statement of file.statements) {
                await connection.execute(statement);
                completed++;
                await connection.execute("UPDATE migration_attempts SET completed_statements = ? WHERE id = ?", [completed, attemptId]);
            }
            await connection.execute("INSERT INTO migrations (filename, checksum) VALUES (?, ?)", [file.filename, file.checksum]);
            await connection.execute("UPDATE migration_attempts SET status = 'applied', finished_at = CURRENT_TIMESTAMP WHERE id = ?", [attemptId]);
        }
        catch (error) {
            const code = typeof error?.code === "string" ? String(error.code).slice(0, 64) : "MIGRATION_FAILED";
            try {
                await connection.execute("UPDATE migration_attempts SET status = 'failed', completed_statements = ?, error_code = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?", [completed, code, attemptId]);
            }
            catch { /* A lost connection leaves a durable running attempt for recovery. */ }
            throw new Error(`Migration ${file.filename} stopped after ${completed}/${file.statements.length} statements (${code}). DDL may already be committed; inspect the schema and resolve explicitly.`);
        }
    }
    async runMigrations() {
        const files = await this.files();
        return this.withLock(async (connection) => {
            const { status } = await this.readState(connection, files);
            if (status.issues.length)
                throw new Error(status.issues.join("; "));
            await this.initializeMetadata(connection);
            for (const filename of status.pending)
                await this.applyFile(connection, files.find((file) => file.filename === filename));
            return status.pending;
        });
    }
    async adoptBaseline(confirmed) {
        if (!confirmed)
            throw new Error("Baseline adoption requires --confirm-schema-reviewed");
        const files = await this.files(), baseline = files.find((file) => file.filename === BASELINE);
        if (!baseline)
            throw new Error("Baseline migration file is missing");
        await this.withLock(async (connection) => {
            const state = await this.readState(connection, files);
            if (state.status.applied.includes(BASELINE))
                throw new Error("Baseline is already recorded; use status to inspect its checksum");
            if (state.status.unresolved.length)
                throw new Error("Resolve interrupted/failed migrations before adopting the baseline");
            await (0, baselineSchema_1.verifyBaselineSchema)(connection, state.tables);
            await this.initializeMetadata(connection);
            await connection.execute("INSERT INTO migrations (filename, checksum) VALUES (?, ?)", [BASELINE, baseline.checksum]);
        });
    }
    /** Explicit pre-baseline bridge; never used by ordinary `up`. */
    async legacyUpgradePlan() {
        const files = await this.files(), connection = await this.pool.getConnection();
        try {
            const state = await this.readState(connection, files);
            if (state.applied.length || state.status.unresolved.length)
                throw new Error('Legacy bridge requires an unrecorded schema; inspect migration history first');
            return await (0, legacyUpgrade_1.planLegacyUpgrade)(connection);
        }
        finally {
            connection.release();
        }
    }
    async upgradeLegacySchema(backupRestored, writesPaused) {
        if (!backupRestored || !writesPaused)
            throw new Error('Legacy upgrade requires a verified restore and paused writes');
        const files = await this.files();
        return this.withLock(async (connection) => {
            const state = await this.readState(connection, files);
            if (state.applied.length || state.status.unresolved.length)
                throw new Error('Legacy bridge requires an unrecorded schema; inspect migration history first');
            const plan = await (0, legacyUpgrade_1.planLegacyUpgrade)(connection);
            const before = await (0, legacyUpgrade_1.legacyDataFingerprint)(connection);
            let completed = 0;
            try {
                for (const statement of plan) {
                    await connection.execute(statement);
                    completed++;
                }
            }
            catch (error) {
                throw new Error(`Legacy DDL stopped after ${completed}/${plan.length} statements (${error.code ?? 'DDL_FAILED'}). DDL may be committed; inspect legacy-plan before recovery.`);
            }
            if ((await (0, legacyUpgrade_1.planLegacyUpgrade)(connection)).length)
                throw new Error('Legacy schema verification failed after DDL; do not adopt history');
            await (0, baselineSchema_1.verifyBaselineSchema)(connection, state.tables);
            const after = await (0, legacyUpgrade_1.legacyDataFingerprint)(connection);
            if (JSON.stringify(before) !== JSON.stringify(after))
                throw new Error('Legacy record fingerprints changed; stop and inspect the private backup');
            const adopted = files.filter(file => Number(file.filename.slice(0, 3)) <= 4);
            if (adopted.length !== 5)
                throw new Error('Expected reviewed migrations 000 through 004');
            await this.initializeMetadata(connection);
            await connection.beginTransaction();
            try {
                for (const file of adopted)
                    await connection.execute('INSERT INTO migrations (filename,checksum) VALUES (?,?)', [file.filename, file.checksum]);
                await connection.commit();
            }
            catch (error) {
                await connection.rollback();
                throw error;
            }
            return { completedStatements: completed, adopted: adopted.map(file => file.filename), recordsPreserved: true, fingerprint: after };
        });
    }
    async adoptLegacyChecksums(confirmed) {
        if (!confirmed)
            throw new Error("Legacy checksum adoption requires --confirm-files-reviewed; the old prefix checksum cannot prove file integrity");
        const files = await this.files();
        return this.withLock(async (connection) => {
            const state = await this.readState(connection, files);
            if (state.status.unresolved.length)
                throw new Error("Resolve interrupted/failed migrations before adopting checksums");
            const updates = [];
            for (const entry of state.applied) {
                const file = files.find((candidate) => candidate.filename === entry.filename);
                if (!file)
                    throw new Error(`Applied migration file is missing: ${entry.filename}`);
                if (entry.checksum === file.checksum)
                    continue;
                if (entry.checksum !== Buffer.from(file.sql).toString("base64").substring(0, 32))
                    throw new Error(`Checksum mismatch: ${entry.filename}`);
                updates.push(file);
            }
            for (const file of updates)
                await connection.execute("UPDATE migrations SET checksum = ? WHERE filename = ?", [file.checksum, file.filename]);
            return updates.map((file) => file.filename);
        });
    }
    async resolveFailedMigration(filename, resolution, confirmed) {
        if (resolution !== "applied" && resolution !== "retry")
            throw new Error("Invalid recovery resolution");
        if (!confirmed)
            throw new Error("Recovery requires --confirm-schema-reviewed for applied, or --confirm-schema-restored for retry");
        const files = await this.files(), file = files.find((candidate) => candidate.filename === filename);
        if (!file)
            throw new Error("Unknown migration filename");
        await this.withLock(async (connection) => {
            const state = await this.readState(connection, files);
            const attempts = state.status.unresolved.filter((attempt) => attempt.filename === filename);
            if (!attempts.length)
                throw new Error("No failed or interrupted attempt exists for this migration");
            if (attempts.some((attempt) => attempt.checksum !== file.checksum))
                throw new Error("Restore the original migration file before resolving it");
            const applied = state.applied.find((entry) => entry.filename === filename);
            if (applied && (resolution === "retry" || applied.checksum !== file.checksum))
                throw new Error("An applied migration cannot be retried or replaced");
            if (filename === BASELINE && resolution === "applied")
                await (0, baselineSchema_1.verifyBaselineSchema)(connection, state.tables);
            if (resolution === "applied" && !applied)
                await connection.execute("INSERT INTO migrations (filename, checksum) VALUES (?, ?)", [filename, file.checksum]);
            await connection.execute("UPDATE migration_attempts SET status = 'resolved', resolution = ?, finished_at = CURRENT_TIMESTAMP WHERE filename = ? AND status IN ('running', 'failed')", [resolution, filename]);
        });
    }
    async rollbackLastMigration() {
        throw new Error("Automatic rollback is disabled: MySQL DDL is not transactional. Restore a verified backup or write a reviewed forward migration.");
    }
}
exports.MigrationSystem = MigrationSystem;

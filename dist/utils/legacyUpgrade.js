"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.legacyTables = void 0;
exports.planLegacyUpgrade = planLegacyUpgrade;
exports.legacyDataFingerprint = legacyDataFingerprint;
const node_crypto_1 = require("node:crypto");
const MigrationSystem_1 = require("./MigrationSystem");
exports.legacyTables = ['attendance', 'messages', 'news', 'news_images', 'notifications', 'parent_students', 'student_comments', 'students', 'users'];
const refs = [
    ['students', 'parent_id', 'users', 'SET NULL'], ['attendance', 'student_id', 'students', 'CASCADE'], ['news', 'created_by', 'users', 'RESTRICT'], ['news_images', 'news_id', 'news', 'CASCADE'],
    ['student_comments', 'student_id', 'students', 'CASCADE'], ['student_comments', 'author_id', 'users', 'CASCADE'], ['student_comments', 'parent_comment_id', 'student_comments', 'CASCADE'],
    ['parent_students', 'user_id', 'users', 'CASCADE'], ['parent_students', 'student_id', 'students', 'CASCADE'],
    ['notifications', 'recipient_user_id', 'users', 'CASCADE'], ['notifications', 'actor_user_id', 'users', 'SET NULL'], ['notifications', 'student_id', 'students', 'SET NULL'], ['notifications', 'comment_id', 'student_comments', 'SET NULL'],
];
const expectedColumns = {
    users: 'id username email role password created_at first_name last_name', students: 'id parent_id first_name last_name date_of_birth grade_level created_at parent_key',
    attendance: 'id student_id date status created_at updated_at', news: 'id title subtitle text created_at created_by', news_images: 'id news_id image_path original_name file_size mime_type uploaded_at',
    student_comments: 'id student_id author_id author_role content date parent_comment_id created_at updated_at', parent_students: 'id user_id student_id connected_at created_at updated_at',
    notifications: 'id recipient_user_id actor_user_id type title message student_id comment_id comment_date is_read read_at created_at', messages: 'id sender_id receiver_id message is_read created_at',
};
/** Targeted pre-baseline bridge for the reviewed nine-table legacy schema.
 * No DELETE/UPDATE, no truncation, no fabricated values and no FK disabling.
 * Call while writes are paused. A partially committed DDL is inspected again.
 */
async function planLegacyUpgrade(connection) {
    const tables = await (0, MigrationSystem_1.migrationRows)(connection, "SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'");
    const applicationTables = tables.filter(t => !['migrations', 'migration_attempts'].includes(t.name));
    if (JSON.stringify(applicationTables.map(t => t.name).sort()) !== JSON.stringify(exports.legacyTables) || applicationTables.some(t => t.engine?.toLowerCase() !== 'innodb'))
        throw new Error('Legacy bridge requires exactly the reviewed nine InnoDB application tables');
    const columns = await (0, MigrationSystem_1.migrationRows)(connection, 'SELECT TABLE_NAME AS table_name,COLUMN_NAME AS name,DATA_TYPE AS data_type,COLUMN_TYPE AS column_type,IS_NULLABLE AS nullable,CHARACTER_MAXIMUM_LENGTH AS max_length,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()');
    for (const [table, names] of Object.entries(expectedColumns)) {
        if (JSON.stringify(columns.filter(c => c.table_name === table).map(c => c.name).sort()) !== JSON.stringify(names.split(' ').sort()))
            throw new Error(`Unreviewed column layout: ${table}`);
    }
    const plan = [];
    const column = (table, name) => columns.find(c => c.table_name === table && c.name === name);
    const requireColumn = (table, name, types, nullable, minLength) => {
        const c = column(table, name);
        if (!types.includes(c.data_type) || (c.nullable === 'YES') !== nullable || (minLength !== undefined && Number(c.max_length) < minLength) || (c.data_type === 'int' && c.column_type.includes('unsigned')))
            throw new Error(`Unreviewed column definition: ${table}.${name}`);
    };
    for (const table of exports.legacyTables)
        requireColumn(table, 'id', ['int'], false);
    for (const [table, name, nullable] of [
        ['students', 'parent_id', true], ['attendance', 'student_id', false], ['news_images', 'news_id', false], ['news_images', 'file_size', false],
        ['student_comments', 'student_id', false], ['student_comments', 'author_id', false], ['student_comments', 'parent_comment_id', true],
        ['parent_students', 'user_id', false], ['parent_students', 'student_id', false], ['notifications', 'recipient_user_id', false], ['notifications', 'actor_user_id', true], ['notifications', 'student_id', true], ['notifications', 'comment_id', true],
    ])
        requireColumn(table, name, ['int'], nullable);
    for (const [table, name, nullable] of [['students', 'date_of_birth', false], ['attendance', 'date', false], ['student_comments', 'date', false], ['notifications', 'comment_date', true]])
        requireColumn(table, name, ['date'], nullable);
    for (const [table, name, nullable, length] of [
        ['students', 'parent_key', true, 15], ['news_images', 'image_path', false, 255], ['news_images', 'original_name', false, 255], ['news_images', 'mime_type', false, 100],
        ['student_comments', 'content', false, 65535], ['notifications', 'title', false, 255], ['notifications', 'message', false, 65535],
    ])
        requireColumn(table, name, ['varchar', 'text', 'mediumtext', 'longtext'], nullable, length);
    if (column('student_comments', 'author_role').column_type !== "enum('admin','teacher','parent')" || column('student_comments', 'author_role').nullable !== 'NO' || column('notifications', 'type').column_type !== "enum('COMMENT_ADDED','COMMENT_REPLIED')" || column('notifications', 'type').nullable !== 'NO')
        throw new Error('Unreviewed legacy enum');
    requireColumn('notifications', 'is_read', ['tinyint'], false);
    requireColumn('notifications', 'read_at', ['timestamp'], true);
    for (const [table, names] of [['student_comments', ['created_at', 'updated_at']], ['parent_students', ['connected_at', 'created_at', 'updated_at']], ['notifications', ['created_at']]]) {
        for (const name of names)
            if (column(table, name).data_type !== 'timestamp')
                throw new Error(`Unreviewed timestamp type: ${table}.${name}`);
    }
    // Read every quality check before planning any DDL. Reports contain counts only.
    const checks = {
        duplicateAttendance: 'SELECT COUNT(*) AS n FROM (SELECT student_id,date FROM attendance GROUP BY student_id,date HAVING COUNT(*)>1) x',
        duplicateImagePath: 'SELECT COUNT(*) AS n FROM (SELECT image_path FROM news_images GROUP BY image_path HAVING COUNT(*)>1) x',
        nullRequired: 'SELECT (SELECT COUNT(*) FROM users WHERE created_at IS NULL)+(SELECT COUNT(*) FROM students WHERE grade_level IS NULL OR created_at IS NULL)+(SELECT COUNT(*) FROM attendance WHERE status IS NULL OR created_at IS NULL OR updated_at IS NULL)+(SELECT COUNT(*) FROM news_images WHERE uploaded_at IS NULL) AS n',
        invalidNewsAuthor: "SELECT COUNT(*) AS n FROM news n LEFT JOIN users u ON n.created_by REGEXP '^[1-9][0-9]*$' AND CAST(n.created_by AS CHAR)=CAST(CAST(n.created_by AS UNSIGNED) AS CHAR) AND u.id=CAST(n.created_by AS UNSIGNED) WHERE u.id IS NULL",
        invalidContent: 'SELECT COUNT(*) AS n FROM student_comments WHERE CHAR_LENGTH(content)<1 OR CHAR_LENGTH(content)>2000',
        invalidParentKey: "SELECT COUNT(*) AS n FROM students WHERE parent_key IS NOT NULL AND parent_key NOT REGEXP '^[0-9]{4}-[0-9]{4}-[A-Z0-9]{4}$'",
        mismatchedReply: 'SELECT COUNT(*) AS n FROM student_comments c JOIN student_comments p ON p.id=c.parent_comment_id WHERE c.student_id<>p.student_id OR c.date<>p.date OR c.id=c.parent_comment_id',
    };
    for (const [table, name, referenced] of refs)
        checks[`orphan_${table}_${name}`] = `SELECT COUNT(*) AS n FROM \`${table}\` c LEFT JOIN \`${referenced}\` p ON p.id=c.\`${name}\` WHERE c.\`${name}\` IS NOT NULL AND p.id IS NULL`;
    const problems = [];
    for (const [name, sql] of Object.entries(checks))
        if (Number((await (0, MigrationSystem_1.migrationRows)(connection, sql))[0].n) !== 0)
            problems.push(name);
    if (problems.length)
        throw new Error(`Legacy data needs review; no DDL was run: ${problems.join(', ')}`);
    const widen = (table, name, length, nullable = false) => {
        const c = column(table, name);
        if (c.data_type !== 'varchar' || Number(c.max_length) < 1)
            throw new Error(`Unreviewed text type: ${table}.${name}`);
        if (Number(c.max_length) < length || (c.nullable === 'YES') !== nullable)
            plan.push(`ALTER TABLE \`${table}\` MODIFY \`${name}\` VARCHAR(${Math.max(length, Number(c.max_length))}) ${nullable ? 'NULL' : 'NOT NULL'}`);
    };
    for (const [table, name, length, nullable] of [
        ['users', 'username', 100, false], ['users', 'email', 254, false], ['users', 'first_name', 100, false], ['users', 'last_name', 100, false],
        ['students', 'first_name', 100, false], ['students', 'last_name', 100, false], ['students', 'grade_level', 100, false], ['news', 'title', 255, false], ['news', 'subtitle', 255, true],
    ])
        widen(table, name, length, nullable);
    for (const [table, name, update] of [['users', 'created_at', false], ['students', 'created_at', false], ['attendance', 'created_at', false], ['attendance', 'updated_at', true], ['news_images', 'uploaded_at', false]]) {
        const c = column(table, name);
        if (c.data_type !== 'timestamp')
            throw new Error(`Unreviewed timestamp type: ${table}.${name}`);
        if (c.nullable === 'YES')
            plan.push(`ALTER TABLE \`${table}\` MODIFY \`${name}\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP${update ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`);
    }
    if (column('attendance', 'status').column_type !== "enum('PRESENT','ABSENT','LATE','EXCUSED')")
        throw new Error('Unreviewed attendance enum');
    if (column('attendance', 'status').nullable === 'YES')
        plan.push("ALTER TABLE attendance MODIFY status ENUM('PRESENT','ABSENT','LATE','EXCUSED') NOT NULL DEFAULT 'PRESENT'");
    const author = column('news', 'created_by');
    if (author.data_type === 'varchar')
        plan.push('ALTER TABLE news MODIFY created_by INT NOT NULL');
    else if (author.data_type !== 'int' || author.column_type.includes('unsigned') || author.nullable !== 'NO')
        throw new Error('Unreviewed news author type');
    const notificationTable = tables.find(t => t.name === 'notifications');
    if (notificationTable.collation === 'latin1_swedish_ci')
        plan.push('ALTER TABLE notifications CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    else if (!notificationTable.collation.startsWith('utf8mb4_'))
        throw new Error('Unreviewed notification charset');
    const indexes = await (0, MigrationSystem_1.migrationRows)(connection, "SELECT TABLE_NAME AS table_name,INDEX_NAME AS name,NON_UNIQUE AS non_unique,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE");
    for (const table of exports.legacyTables)
        if (!indexes.some(i => i.table_name === table && i.name === 'PRIMARY' && i.columns === 'id') || !column(table, 'id').extra.includes('auto_increment'))
            throw new Error(`Unreviewed primary key: ${table}`);
    const addIndex = (table, names, unique = false) => {
        if (indexes.some(i => i.table_name === table && i.columns === names && (!unique || Number(i.non_unique) === 0)))
            return;
        const name = `bridge_${unique ? 'uq' : 'idx'}_${names.replace(/,/g, '_')}`;
        if (indexes.some(i => i.table_name === table && i.name === name))
            throw new Error(`Conflicting index: ${table}.${name}`);
        plan.push(`ALTER TABLE \`${table}\` ADD ${unique ? 'UNIQUE ' : ''}INDEX \`${name}\` (${names.split(',').map(n => '`' + n + '`').join(',')})`);
    };
    for (const [table, names] of [['users', 'username'], ['users', 'email'], ['attendance', 'student_id,date'], ['news_images', 'image_path'], ['students', 'parent_key'], ['parent_students', 'user_id,student_id']])
        addIndex(table, names, true);
    for (const [table, names] of [['attendance', 'date'], ['news', 'created_at'], ['students', 'parent_key'], ['student_comments', 'student_id,date'], ['student_comments', 'author_id'], ['student_comments', 'date'], ['student_comments', 'parent_comment_id'], ['student_comments', 'author_role'], ['student_comments', 'student_id,date,parent_comment_id'], ['parent_students', 'user_id'], ['parent_students', 'student_id'], ['notifications', 'recipient_user_id'], ['notifications', 'recipient_user_id,is_read'], ['notifications', 'created_at'], ['notifications', 'type']])
        addIndex(table, names);
    const foreignKeys = await (0, MigrationSystem_1.migrationRows)(connection, `SELECT k.TABLE_NAME AS table_name,k.COLUMN_NAME AS name,k.REFERENCED_TABLE_NAME AS referenced_table,k.REFERENCED_COLUMN_NAME AS referenced_column,r.DELETE_RULE AS delete_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
    for (const [table, name, referenced, rule] of refs) {
        const existing = foreignKeys.filter(k => k.table_name === table && k.name === name);
        if (existing.length) {
            if (!existing.every(k => k.referenced_table === referenced && k.referenced_column === 'id' && (k.delete_rule === rule || (rule === 'RESTRICT' && k.delete_rule === 'NO ACTION'))))
                throw new Error(`Conflicting foreign key: ${table}.${name}`);
            continue;
        }
        plan.push(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`bridge_fk_${table}_${name}\` FOREIGN KEY (\`${name}\`) REFERENCES \`${referenced}\`(id) ON DELETE ${rule}`);
    }
    const constraints = await (0, MigrationSystem_1.migrationRows)(connection, "SELECT t.TABLE_NAME AS table_name,c.CONSTRAINT_NAME AS name,c.CHECK_CLAUSE AS clause FROM information_schema.CHECK_CONSTRAINTS c JOIN information_schema.TABLE_CONSTRAINTS t ON t.CONSTRAINT_SCHEMA=c.CONSTRAINT_SCHEMA AND t.CONSTRAINT_NAME=c.CONSTRAINT_NAME WHERE c.CONSTRAINT_SCHEMA=DATABASE() AND t.CONSTRAINT_TYPE='CHECK'");
    const normal = (value) => value.toLowerCase().replace(/\\'/g, "'").replace(/`/g, '').replace(/_(?:utf8mb4|utf8mb3|latin1)(?=')/g, '').replace(/regexp_like\((\w+),\s*('[^']*')\)/g, '$1 regexp $2').replace(/[\s()]/g, '');
    for (const [table, name, clause] of [['student_comments', 'chk_content_length', 'CHAR_LENGTH(content) >= 1 AND CHAR_LENGTH(content) <= 2000'], ['students', 'chk_parent_key_format', "parent_key IS NULL OR parent_key REGEXP '^[0-9]{4}-[0-9]{4}-[A-Z0-9]{4}$'"]]) {
        const found = constraints.find(c => c.table_name === table && c.name === name);
        if (found) {
            if (normal(found.clause) !== normal(clause))
                throw new Error(`Unreviewed check expression: ${table}.${name}`);
        }
        else
            plan.push(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` CHECK (${clause})`);
    }
    return plan;
}
/** Hash only; never log or return the actual legacy records. Normalize scalar types
 * so news.created_by's verified decimal string -> INT conversion is comparable. */
async function legacyDataFingerprint(connection) {
    const fingerprint = {};
    for (const table of exports.legacyTables) {
        const [raw] = await connection.execute(`SELECT * FROM \`${table}\` ORDER BY id`);
        const rows = raw;
        const canonical = rows.map(row => Object.fromEntries(Object.keys(row).sort().map(key => [key, row[key] === null ? null : row[key] instanceof Date ? row[key].toISOString() : String(row[key])])));
        fingerprint[table] = { count: rows.length, sha256: (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(canonical)).digest('hex') };
    }
    return fingerprint;
}

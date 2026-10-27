"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBaselineSchema = verifyBaselineSchema;
const id = { type: "id" };
const text = (minLength, nullable = false) => ({ type: "text", minLength, nullable });
const timestamp = { type: "timestamp" };
const BASELINE_COLUMNS = {
    users: { id, username: text(100), email: text(254), password: text(255), role: { type: "role" }, first_name: text(100), last_name: text(100), created_at: timestamp },
    students: { id, parent_id: { type: "int", nullable: true }, first_name: text(100), last_name: text(100), date_of_birth: { type: "date" }, grade_level: text(100), created_at: timestamp },
    attendance: { id, student_id: { type: "int" }, date: { type: "date" }, status: { type: "status" }, created_at: timestamp, updated_at: timestamp },
    news: { id, title: text(255), subtitle: text(255, true), text: text(65535), created_by: { type: "int" }, created_at: timestamp },
    news_images: { id, news_id: { type: "int" }, image_path: text(255), original_name: text(255), file_size: { type: "int" }, mime_type: text(100), uploaded_at: timestamp },
};
function columnCompatible(column, spec) {
    if ((column.nullable === "YES") !== Boolean(spec.nullable))
        return false;
    if (spec.type === "id" || spec.type === "int")
        return column.data_type === "int" && !column.column_type.includes("unsigned") && (spec.type !== "id" || column.extra.includes("auto_increment"));
    if (spec.type === "date")
        return column.data_type === "date";
    if (spec.type === "timestamp")
        return ["timestamp", "datetime"].includes(column.data_type);
    if (spec.type === "text")
        return ["varchar", "char", "text", "mediumtext", "longtext"].includes(column.data_type) && Number(column.max_length) >= (spec.minLength ?? 0);
    if (spec.type === "role")
        return (column.data_type === "varchar" && Number(column.max_length) >= 20) || (column.data_type === "enum" && ["admin", "teacher", "parent"].every((role) => column.column_type.includes(`'${role}'`)));
    return column.data_type === "enum" && ["PRESENT", "ABSENT", "LATE", "EXCUSED"].every((status) => column.column_type.includes(`'${status}'`));
}
async function rows(connection, sql) {
    const [result] = await connection.execute(sql);
    return result;
}
/** Compatibility verification only: never attempts to repair or delete existing data. */
async function verifyBaselineSchema(connection, tables) {
    const problems = [];
    const coreTables = Object.keys(BASELINE_COLUMNS);
    for (const table of coreTables) {
        const found = tables.find((entry) => entry.name === table);
        if (!found || found.engine?.toLowerCase() !== "innodb")
            problems.push(`${table}: required InnoDB table missing or incompatible`);
    }
    const columns = await rows(connection, `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, DATA_TYPE AS data_type,
    COLUMN_TYPE AS column_type, IS_NULLABLE AS nullable, CHARACTER_MAXIMUM_LENGTH AS max_length, EXTRA AS extra
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`);
    for (const [table, specs] of Object.entries(BASELINE_COLUMNS)) {
        for (const [name, spec] of Object.entries(specs)) {
            const column = columns.find((entry) => entry.table_name === table && entry.name === name);
            if (!column || !columnCompatible(column, spec))
                problems.push(`${table}.${name}: missing or incompatible column`);
        }
    }
    const indexes = await rows(connection, `SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE`);
    for (const table of coreTables)
        if (!indexes.some((index) => index.table_name === table && index.name === "PRIMARY" && index.columns === "id"))
            problems.push(`${table}: primary key(id) required`);
    for (const [table, names] of [["users", "username"], ["users", "email"], ["attendance", "student_id,date"], ["news_images", "image_path"]]) {
        if (!indexes.some((index) => index.table_name === table && Number(index.non_unique) === 0 && index.columns === names))
            problems.push(`${table}: unique(${names}) required; review existing data before adding it`);
    }
    const foreignKeys = await rows(connection, `SELECT k.TABLE_NAME AS table_name, k.COLUMN_NAME AS name,
    k.REFERENCED_TABLE_NAME AS referenced_table, k.REFERENCED_COLUMN_NAME AS referenced_column, r.DELETE_RULE AS delete_rule
    FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r
    ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND r.TABLE_NAME = k.TABLE_NAME
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL`);
    for (const [table, name, referenced, rule] of [["students", "parent_id", "users", "SET NULL"], ["attendance", "student_id", "students", "CASCADE"], ["news", "created_by", "users", "RESTRICT"], ["news_images", "news_id", "news", "CASCADE"]]) {
        if (!foreignKeys.some((key) => key.table_name === table && key.name === name && key.referenced_table === referenced && key.referenced_column === "id" && (key.delete_rule === rule || (rule === "RESTRICT" && key.delete_rule === "NO ACTION"))))
            problems.push(`${table}.${name}: compatible foreign key/delete rule required`);
    }
    if (problems.length)
        throw new Error(`Baseline adoption refused; no application data was changed:\n${problems.join("\n")}`);
}

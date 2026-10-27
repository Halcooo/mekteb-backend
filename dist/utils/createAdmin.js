"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAdminInput = readAdminInput;
exports.createAdmin = createAdmin;
const bcrypt_1 = __importDefault(require("bcrypt"));
const requestValidation_1 = require("./requestValidation");
/** No default administrator, passwords or privilege changes to existing accounts. */
function readAdminInput(environment) {
    const username = environment.BOOTSTRAP_ADMIN_USERNAME;
    const email = environment.BOOTSTRAP_ADMIN_EMAIL;
    const password = environment.BOOTSTRAP_ADMIN_PASSWORD;
    const firstName = environment.BOOTSTRAP_ADMIN_FIRST_NAME;
    const lastName = environment.BOOTSTRAP_ADMIN_LAST_NAME;
    if (!(0, requestValidation_1.isValidText)(username) || !(0, requestValidation_1.isValidText)(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !(0, requestValidation_1.isValidText)(firstName) || !(0, requestValidation_1.isValidText)(lastName)) {
        throw new Error("Set BOOTSTRAP_ADMIN_USERNAME, EMAIL, FIRST_NAME and LAST_NAME with valid values (all use the BOOTSTRAP_ADMIN_ prefix)");
    }
    if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
        throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes");
    }
    return { username: username.trim(), email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() };
}
async function createAdmin(pool, input) {
    // Validate again at this boundary so callers cannot bypass the CLI checks.
    const validated = readAdminInput({
        BOOTSTRAP_ADMIN_USERNAME: input.username, BOOTSTRAP_ADMIN_EMAIL: input.email,
        BOOTSTRAP_ADMIN_PASSWORD: input.password, BOOTSTRAP_ADMIN_FIRST_NAME: input.firstName,
        BOOTSTRAP_ADMIN_LAST_NAME: input.lastName,
    });
    const passwordHash = await bcrypt_1.default.hash(validated.password, 12);
    try {
        // Unique username/email constraints make concurrent attempts safe. Never use
        // ON DUPLICATE KEY UPDATE: an existing parent must not become an administrator.
        const [result] = await pool.execute("INSERT INTO users (username, email, password, role, first_name, last_name, created_at) VALUES (?, ?, ?, 'admin', ?, ?, CURRENT_TIMESTAMP)", [validated.username, validated.email, passwordHash, validated.firstName, validated.lastName]);
        return result.insertId;
    }
    catch (error) {
        if (error?.code === "ER_DUP_ENTRY")
            throw new Error("An account already uses this username or email; it was not changed");
        throw new Error("Administrator creation failed; verify schema and database access without logging credentials");
    }
}

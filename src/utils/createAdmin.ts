import bcrypt from "bcrypt";
import type { Pool } from "mysql2/promise";
import type { ResultSetHeader } from "mysql2";
import { isValidText } from "./requestValidation";

export interface AdminInput { username: string; email: string; password: string; firstName: string; lastName: string }

/** No default administrator, passwords or privilege changes to existing accounts. */
export function readAdminInput(environment: Record<string, string | undefined>): AdminInput {
  const username = environment.BOOTSTRAP_ADMIN_USERNAME;
  const email = environment.BOOTSTRAP_ADMIN_EMAIL;
  const password = environment.BOOTSTRAP_ADMIN_PASSWORD;
  const firstName = environment.BOOTSTRAP_ADMIN_FIRST_NAME;
  const lastName = environment.BOOTSTRAP_ADMIN_LAST_NAME;
  if (!isValidText(username) || !isValidText(email, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !isValidText(firstName) || !isValidText(lastName)) {
    throw new Error("Set BOOTSTRAP_ADMIN_USERNAME, EMAIL, FIRST_NAME and LAST_NAME with valid values (all use the BOOTSTRAP_ADMIN_ prefix)");
  }
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters and at most 72 UTF-8 bytes");
  }
  return { username: username.trim(), email: email.trim(), password, firstName: firstName.trim(), lastName: lastName.trim() };
}

export async function createAdmin(pool: Pick<Pool, "execute">, input: AdminInput): Promise<number> {
  // Validate again at this boundary so callers cannot bypass the CLI checks.
  const validated = readAdminInput({
    BOOTSTRAP_ADMIN_USERNAME: input.username, BOOTSTRAP_ADMIN_EMAIL: input.email,
    BOOTSTRAP_ADMIN_PASSWORD: input.password, BOOTSTRAP_ADMIN_FIRST_NAME: input.firstName,
    BOOTSTRAP_ADMIN_LAST_NAME: input.lastName,
  });
  const passwordHash = await bcrypt.hash(validated.password, 12);
  try {
    // Unique username/email constraints make concurrent attempts safe. Never use
    // ON DUPLICATE KEY UPDATE: an existing parent must not become an administrator.
    const [result] = await pool.execute<ResultSetHeader>(
      "INSERT INTO users (username, email, password, role, first_name, last_name, created_at) VALUES (?, ?, ?, 'admin', ?, ?, CURRENT_TIMESTAMP)",
      [validated.username, validated.email, passwordHash, validated.firstName, validated.lastName],
    );
    return result.insertId;
  } catch (error) {
    if ((error as { code?: string })?.code === "ER_DUP_ENTRY") throw new Error("An account already uses this username or email; it was not changed");
    throw new Error("Administrator creation failed; verify schema and database access without logging credentials");
  }
}

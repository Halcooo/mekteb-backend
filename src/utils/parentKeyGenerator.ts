/**
 * Utility functions for generating and validating parent keys
 */

/**
 * Generates a unique parent key in format YYYY-MMDD-XXXX
 * Where:
 * - YYYY is the current year
 * - MM is the current month
 * - DD is the current day
 * - XXXX is a random 4-character alphanumeric string
 */
export function generateParentKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  // Generate 4-character random string with uppercase letters and numbers
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `${year}-${month}${day}-${randomPart}`;
}

/**
 * Validates parent key format
 * Expected format: YYYY-MMDD-XXXX
 */
export function validateParentKeyFormat(key: string): boolean {
  const parentKeyRegex = /^[0-9]{4}-[0-9]{4}-[A-Z0-9]{4}$/;
  return parentKeyRegex.test(key);
}

/**
 * Generates a unique parent key ensuring no duplicates in database
 * This should be called from the service layer with database access
 */
export async function generateUniqueParentKey(
  checkExistsFn: (key: string) => Promise<boolean>
): Promise<string> {
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const key = generateParentKey();
    const exists = await checkExistsFn(key);

    if (!exists) {
      return key;
    }

    attempts++;
  }

  throw new Error(
    "Unable to generate unique parent key after multiple attempts"
  );
}

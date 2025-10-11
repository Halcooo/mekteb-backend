/**
 * Utility functions for converting between snake_case and camelCase
 * Used to maintain camelCase in TypeScript code while keeping snake_case in database
 */

// Convert snake_case string to camelCase
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert camelCase string to snake_case
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// Convert object keys from snake_case to camelCase
export function keysToCamelCase<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;

  if (Array.isArray(obj)) {
    return obj.map(keysToCamelCase) as T;
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const camelObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const camelKey = toCamelCase(key);
        camelObj[camelKey] = keysToCamelCase(
          (obj as Record<string, unknown>)[key]
        );
      }
    }
    return camelObj as T;
  }

  return obj as T;
}

// Convert object keys from camelCase to snake_case
export function keysToSnakeCase<T = unknown>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;

  if (Array.isArray(obj)) {
    return obj.map(keysToSnakeCase) as T;
  }

  if (typeof obj === "object" && obj.constructor === Object) {
    const snakeObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const snakeKey = toSnakeCase(key);
        snakeObj[snakeKey] = keysToSnakeCase(
          (obj as Record<string, unknown>)[key]
        );
      }
    }
    return snakeObj as T;
  }

  return obj as T;
}

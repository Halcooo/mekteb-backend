/**
 * Utility functions for converting between snake_case and camelCase
 * Used to maintain camelCase in TypeScript code while keeping snake_case in database
 */
// Convert snake_case string to camelCase
export function toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}
// Convert camelCase string to snake_case
export function toSnakeCase(str) {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
// Convert object keys from snake_case to camelCase
export function keysToCamelCase(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(keysToCamelCase);
    }
    if (typeof obj === "object" && obj.constructor === Object) {
        const camelObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const camelKey = toCamelCase(key);
                camelObj[camelKey] = keysToCamelCase(obj[key]);
            }
        }
        return camelObj;
    }
    return obj;
}
// Convert object keys from camelCase to snake_case
export function keysToSnakeCase(obj) {
    if (obj === null || obj === undefined)
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(keysToSnakeCase);
    }
    if (typeof obj === "object" && obj.constructor === Object) {
        const snakeObj = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const snakeKey = toSnakeCase(key);
                snakeObj[snakeKey] = keysToSnakeCase(obj[key]);
            }
        }
        return snakeObj;
    }
    return obj;
}

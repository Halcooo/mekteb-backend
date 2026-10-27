"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePositiveInteger = parsePositiveInteger;
exports.isValidText = isValidText;
/** Parse an entire positive integer input; reject partial, unsafe or array values. */
function parsePositiveInteger(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value))
        return null;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function isValidText(value, maxLength = 100) {
    return (typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().length <= maxLength);
}

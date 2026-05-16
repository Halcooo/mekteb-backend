"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDateOnlyInput = exports.normalizeDateOnlyInput = void 0;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateOnly = (value) => {
    if (!DATE_ONLY_REGEX.test(value)) {
        return false;
    }
    const [yearStr, monthStr, dayStr] = value.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    const candidate = new Date(year, month - 1, day);
    return (candidate.getFullYear() === year &&
        candidate.getMonth() === month - 1 &&
        candidate.getDate() === day);
};
const toDateOnly = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const normalizeDateOnlyInput = (value) => {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (isValidDateOnly(trimmed)) {
        return trimmed;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return toDateOnly(parsed);
};
exports.normalizeDateOnlyInput = normalizeDateOnlyInput;
const isDateOnlyInput = (value) => {
    return typeof value === "string" && isValidDateOnly(value);
};
exports.isDateOnlyInput = isDateOnlyInput;

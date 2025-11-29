/**
 * Utility functions for formatting dates and times in Bosnian format
 * Provides consistent date/time formatting throughout the backend
 */
// Bosnian month names
const BOSNIAN_MONTHS = [
    "januar",
    "februar",
    "mart",
    "april",
    "maj",
    "juni",
    "juli",
    "august",
    "septembar",
    "oktobar",
    "novembar",
    "decembar",
];
// Bosnian day names
const BOSNIAN_DAYS = [
    "nedjelja",
    "ponedjeljak",
    "utorak",
    "srijeda",
    "četvrtak",
    "petak",
    "subota",
];
/**
 * Format date in Bosnian style: dd.mm.yyyy
 * @param date - Date object, string, or timestamp
 * @returns Formatted date string (e.g., "04.10.2025")
 */
export function formatBosnianDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}
/**
 * Format time in Bosnian style: HH:mm
 * @param date - Date object, string, or timestamp
 * @returns Formatted time string (e.g., "14:30")
 */
export function formatBosnianTime(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    const hours = d.getHours().toString().padStart(2, "0");
    const minutes = d.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
}
/**
 * Format date and time in Bosnian style: dd.mm.yyyy HH:mm
 * @param date - Date object, string, or timestamp
 * @returns Formatted datetime string (e.g., "04.10.2025 14:30")
 */
export function formatBosnianDateTime(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    return `${formatBosnianDate(d)} ${formatBosnianTime(d)}`;
}
/**
 * Format date with full month name in Bosnian
 * @param date - Date object, string, or timestamp
 * @returns Formatted date string (e.g., "4. oktobar 2025")
 */
export function formatBosnianDateLong(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    const day = d.getDate();
    const month = BOSNIAN_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day}. ${month} ${year}`;
}
/**
 * Format date for database storage (YYYY-MM-DD HH:mm:ss)
 * @param date - Date object, string, or timestamp
 * @returns MySQL compatible datetime string
 */
export function formatMySQLDateTime(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    return d.toISOString().slice(0, 19).replace("T", " ");
}
/**
 * Format date for database storage (YYYY-MM-DD)
 * @param date - Date object, string, or timestamp
 * @returns MySQL compatible date string
 */
export function formatMySQLDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime()))
        return "";
    return d.toISOString().slice(0, 10);
}
/**
 * Parse Bosnian date format (dd.mm.yyyy) to Date object
 * @param dateString - Date string in Bosnian format
 * @returns Date object or null if invalid
 */
export function parseBosnianDate(dateString) {
    const parts = dateString.split(".");
    if (parts.length !== 3)
        return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year))
        return null;
    const date = new Date(year, month, day);
    // Validate the date
    if (date.getDate() !== day ||
        date.getMonth() !== month ||
        date.getFullYear() !== year) {
        return null;
    }
    return date;
}
/**
 * Get current date formatted in Bosnian style
 * @returns Current date as Bosnian formatted string
 */
export function getCurrentBosnianDate() {
    return formatBosnianDate(new Date());
}
/**
 * Get current datetime formatted in Bosnian style
 * @returns Current datetime as Bosnian formatted string
 */
export function getCurrentBosnianDateTime() {
    return formatBosnianDateTime(new Date());
}

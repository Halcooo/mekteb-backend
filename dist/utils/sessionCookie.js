"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRefreshCookie = readRefreshCookie;
exports.setRefreshCookie = setRefreshCookie;
exports.clearRefreshCookie = clearRefreshCookie;
function cookieName() {
    return process.env.NODE_ENV === "production" ? "__Secure-mekteb_refresh" : "mekteb_refresh";
}
function cookieOptions() {
    return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/backend/api/auth" };
}
function readRefreshCookie(req) {
    const matches = (req.headers.cookie ?? "").split(";").map((part) => part.trim())
        .filter((part) => part.startsWith(`${cookieName()}=`));
    if (matches.length !== 1)
        return null;
    try {
        const value = decodeURIComponent(matches[0].slice(cookieName().length + 1));
        return value.length > 0 && value.length <= 256 ? value : null;
    }
    catch {
        return null;
    }
}
function setRefreshCookie(res, token, expiresAt) {
    res.cookie(cookieName(), token, { ...cookieOptions(), expires: expiresAt });
}
function clearRefreshCookie(res) {
    res.clearCookie(cookieName(), cookieOptions());
}

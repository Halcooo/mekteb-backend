import type { CookieOptions, Request, Response } from "express";

function cookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Secure-mekteb_refresh" : "mekteb_refresh";
}

function cookieOptions(): CookieOptions {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/backend/api/auth" };
}

export function readRefreshCookie(req: Request): string | null {
  const matches = (req.headers.cookie ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName()}=`));
  if (matches.length !== 1) return null;
  try {
    const value = decodeURIComponent(matches[0].slice(cookieName().length + 1));
    return value.length > 0 && value.length <= 256 ? value : null;
  } catch { return null; }
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(cookieName(), token, { ...cookieOptions(), expires: expiresAt });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(cookieName(), cookieOptions());
}

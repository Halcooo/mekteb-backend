import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Tests supply isolated configuration and must never load real credentials.
if (process.env.NODE_ENV !== "test") {
  const configuredFile=process.env.MEKTEB_ENV_FILE;
  if(configuredFile&&(!path.isAbsolute(configuredFile)||!fs.existsSync(configuredFile)))throw new Error('MEKTEB_ENV_FILE must name an existing absolute configuration file');
  const envPath = configuredFile??path.resolve(process.cwd(), `.env.${process.env.NODE_ENV ?? "development"}`);
  dotenv.config({
    path: fs.existsSync(envPath) ? envPath : path.resolve(process.cwd(), ".env"),
    quiet: true,
  });
}

export function getAllowedOrigins(): string[] {
  const configured = process.env.FRONTEND_URL?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!configured?.length) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FRONTEND_URL must list the permitted frontend origins");
    }
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }
  return configured.map((origin) => {
    const url = new URL(origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.origin !== origin ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      throw new Error("FRONTEND_URL must contain exact origins (HTTPS in production)");
    }
    return url.origin;
  });
}

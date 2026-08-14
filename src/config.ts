import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Project root. In dev this file is src/config.ts, after a build it is
 * dist/config.js -- one level up in both cases.
 */
export const ROOT = path.resolve(here, "..");

function env(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

const dataDir = path.resolve(env("DATA_DIR", path.join(ROOT, "data")));

export const config = {
  port: envInt("PORT", 3000),
  dataDir,
  dbPath: path.join(dataDir, "crawl.db"),
  uploadDir: path.join(dataDir, "uploads"),
  tmpDir: path.join(dataDir, "tmp"),
  adminPassword: env("ADMIN_PASSWORD", "changeme"),
  /** Overrides crawl.eventCode when set, so you can rotate the code without a code change. */
  eventCodeOverride: process.env.EVENT_CODE || null,
  maxUploadBytes: envInt("MAX_UPLOAD_MB", 400) * 1024 * 1024,
  viewsDir: path.join(here, "views"),
  publicDir: path.join(ROOT, "public"),
  /** How long a team session cookie lives. A crawl is one night; a week is plenty. */
  sessionMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export function ensureDirectories(): void {
  for (const dir of [config.dataDir, config.uploadDir, config.tmpDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

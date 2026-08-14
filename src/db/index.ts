import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, ensureDirectories } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

ensureDirectories();

export const db: Database.Database = new Database(config.dbPath);

db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));

export function now(): number {
  return Date.now();
}

export function logEvent(teamId: number | null, type: string, payload?: unknown): void {
  db.prepare(
    `INSERT INTO events (team_id, type, payload_json, created_at) VALUES (?, ?, ?, ?)`,
  ).run(teamId, type, payload === undefined ? null : JSON.stringify(payload), now());
}

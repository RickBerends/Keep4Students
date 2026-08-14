import crypto from "node:crypto";
import { db, logEvent, now } from "../db/index.js";
import { normalizeTeamName } from "./answers.js";
import { ensureStarted, type TeamRow } from "./state.js";

/**
 * Teams are identified by name alone -- there are no passwords. Typing an
 * existing team's name joins that team, which is exactly what we want when the
 * four people in a team each open the site on their own phone.
 */
export function joinOrCreateTeam(rawName: string): TeamRow {
  const name = rawName.trim().replace(/\s+/g, " ");
  const normalized = normalizeTeamName(name);

  const existing = db
    .prepare<[string], TeamRow>(`SELECT * FROM teams WHERE normalized_name = ?`)
    .get(normalized);

  if (existing) {
    ensureStarted(existing.id);
    return existing;
  }

  const info = db
    .prepare(`INSERT INTO teams (name, normalized_name, created_at) VALUES (?, ?, ?)`)
    .run(name, normalized, now());

  const team = db
    .prepare<[number], TeamRow>(`SELECT * FROM teams WHERE id = ?`)
    .get(Number(info.lastInsertRowid))!;

  logEvent(team.id, "TEAM_CREATED", { name: team.name });
  ensureStarted(team.id);
  return team;
}

export function createSession(teamId: number): string {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare(`INSERT INTO sessions (token, team_id, created_at) VALUES (?, ?, ?)`).run(
    token,
    teamId,
    now(),
  );
  return token;
}

export function teamForSession(token: string | undefined): TeamRow | null {
  if (!token) return null;
  const row = db
    .prepare<[string], TeamRow>(
      `SELECT t.* FROM sessions s JOIN teams t ON t.id = s.team_id WHERE s.token = ?`,
    )
    .get(token);
  return row ?? null;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token = ?`).run(token);
}

export function teamById(id: number): TeamRow | null {
  return db.prepare<[number], TeamRow>(`SELECT * FROM teams WHERE id = ?`).get(id) ?? null;
}

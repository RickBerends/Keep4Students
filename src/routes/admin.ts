import crypto from "node:crypto";
import fs from "node:fs";
import { Router, type NextFunction, type Request, type Response } from "express";
import { config } from "../config.js";
import { crawl, eventCode } from "../content/index.js";
import { db, logEvent } from "../db/index.js";
import { allTeamProgress } from "../domain/state.js";
import { storage } from "../services/storage.js";

export const adminRouter: Router = Router();

/**
 * HTTP basic auth with one shared password. This is a pubcrawl, not a bank --
 * but the comparison is still constant-time so the password cannot be guessed
 * a character at a time.
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const password = decoded.slice(decoded.indexOf(":") + 1);
    const a = crypto.createHash("sha256").update(password).digest();
    const b = crypto.createHash("sha256").update(config.adminPassword).digest();
    if (crypto.timingSafeEqual(a, b)) {
      next();
      return;
    }
  }

  res.setHeader("WWW-Authenticate", 'Basic realm="pubcrawl admin"');
  res.status(401).send("Admin password required.");
}

adminRouter.use("/admin", requireAdmin);

interface UploadRow {
  id: number;
  team_id: number;
  team_name: string;
  stop_id: string;
  kind: string;
  side_challenge_type: string | null;
  stored_key: string | null;
  original_name: string | null;
  mime: string | null;
  size: number | null;
  accepted: number;
  flagged: number;
  flag_reason: string | null;
  reject_reason: string | null;
  extracted_created_at: number | null;
  metadata_json: string | null;
  created_at: number;
}

adminRouter.get("/admin", (_req, res) => {
  const uploads = db
    .prepare<[], UploadRow>(
      `SELECT u.*, t.name AS team_name
       FROM uploads u JOIN teams t ON t.id = u.team_id
       ORDER BY u.created_at DESC
       LIMIT 300`,
    )
    .all();

  const events = db
    .prepare<[], { id: number; team_name: string | null; type: string; payload_json: string | null; created_at: number }>(
      `SELECT e.id, t.name AS team_name, e.type, e.payload_json, e.created_at
       FROM events e LEFT JOIN teams t ON t.id = e.team_id
       ORDER BY e.created_at DESC
       LIMIT 200`,
    )
    .all();

  res.render("admin", {
    title: crawl.title,
    eventCode,
    teams: allTeamProgress(),
    uploads,
    events,
  });
});

/** Streams a stored file. Inline so video/images preview in the gallery. */
adminRouter.get("/admin/uploads/:id", (req, res) => {
  const row = db
    .prepare<[string], { stored_key: string | null; mime: string | null; original_name: string | null }>(
      `SELECT stored_key, mime, original_name FROM uploads WHERE id = ?`,
    )
    .get(String(req.params.id));

  if (!row?.stored_key) {
    res.status(404).send("No stored file for that upload.");
    return;
  }

  const absolute = storage.absolutePath(row.stored_key);
  if (!fs.existsSync(absolute)) {
    res.status(404).send("File is missing from storage.");
    return;
  }

  res.setHeader("Content-Type", row.mime ?? "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${(row.original_name ?? "upload").replace(/[^\w.\-]/g, "_")}"`,
  );
  fs.createReadStream(absolute).pipe(res);
});

/** Puts a team back to the very start. Uploads are kept for the record. */
adminRouter.post("/admin/teams/:id/reset", (req, res) => {
  const teamId = Number.parseInt(String(req.params.id), 10);
  if (Number.isNaN(teamId)) {
    res.status(400).send("Bad team id.");
    return;
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM team_stops WHERE team_id = ?`).run(teamId);
    db.prepare(`UPDATE teams SET finished_at = NULL WHERE id = ?`).run(teamId);
  })();
  logEvent(teamId, "TEAM_RESET");

  res.redirect("/admin");
});

/** Nudges a stuck team forward without making them redo the upload. */
adminRouter.post("/admin/teams/:id/advance", (req, res) => {
  const teamId = Number.parseInt(String(req.params.id), 10);
  if (Number.isNaN(teamId)) {
    res.status(400).send("Bad team id.");
    return;
  }

  const row = db
    .prepare<[number], { stop_id: string; phase: string }>(
      `SELECT stop_id, phase FROM team_stops WHERE team_id = ? ORDER BY stop_index DESC LIMIT 1`,
    )
    .get(teamId);

  if (row?.phase === "CHALLENGE") {
    db.prepare(
      `UPDATE team_stops SET phase = 'QUIZ', challenge_passed_at = ?
       WHERE team_id = ? AND stop_id = ?`,
    ).run(Date.now(), teamId, row.stop_id);
    logEvent(teamId, "ADMIN_ADVANCED", { stopId: row.stop_id });
  }

  res.redirect("/admin");
});

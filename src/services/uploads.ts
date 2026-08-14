import fs from "node:fs";
import { config } from "../config.js";
import { db, logEvent, now } from "../db/index.js";
import type { Challenge, SideChallengeType } from "../content/types.js";
import { classify, evaluate, probe } from "./metadata.js";
import { sha256File, storage } from "./storage.js";

export interface ProcessUploadInput {
  teamId: number;
  stopId: string;
  kind: "CHALLENGE" | "HINT";
  sideChallengeType?: SideChallengeType;
  challenge: Challenge;
  tempPath: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  /** File.lastModified from the browser, if the client sent it. */
  clientLastModified: number | null;
}

export interface ProcessUploadResult {
  uploadId: number;
  accepted: boolean;
  rejectReason?: string;
  flagged: boolean;
}

const findDuplicate = db.prepare<[string, number], { id: number; stop_id: string }>(
  `SELECT id, stop_id FROM uploads
   WHERE sha256 = ? AND team_id = ? AND accepted = 1
   LIMIT 1`,
);

/**
 * Runs an uploaded file through every check and records the outcome.
 *
 * Rejected files are deleted rather than stored -- there is no reason to keep
 * 200MB of someone's wrong-format holiday video. The row stays either way, so
 * /admin shows what was tried.
 */
export async function processUpload(input: ProcessUploadInput): Promise<ProcessUploadResult> {
  const uploadedAt = now();
  const kind = classify(input.mime, input.originalName);

  const hash = await sha256File(input.tempPath);
  const probed = await probe(input.tempPath, kind, input.clientLastModified);

  let verdict = evaluate({
    challenge: input.challenge,
    kind,
    sizeBytes: input.sizeBytes,
    uploadedAt,
    probe: probed,
    maxUploadBytes: config.maxUploadBytes,
  });

  // The one check that needs no metadata and cannot be dodged: this team has
  // already used this exact file. Stops one beer video clearing the whole crawl.
  if (verdict.accepted) {
    const duplicate = findDuplicate.get(hash, input.teamId);
    if (duplicate) {
      verdict = {
        accepted: false,
        flagged: false,
        rejectReason: "You have already uploaded that exact file. Nice try -- shoot a new one.",
      };
    }
  }

  let storedKey: string | null = null;
  if (verdict.accepted) {
    storedKey = await storage.save(input.tempPath, input.originalName);
  } else {
    await fs.promises.unlink(input.tempPath).catch(() => {});
  }

  const result = db
    .prepare(
      `INSERT INTO uploads (
         team_id, stop_id, kind, side_challenge_type, stored_key, original_name,
         mime, size, sha256, client_last_modified, extracted_created_at,
         metadata_json, accepted, flagged, flag_reason, reject_reason, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.teamId,
      input.stopId,
      input.kind,
      input.sideChallengeType ?? null,
      storedKey,
      input.originalName,
      input.mime,
      input.sizeBytes,
      hash,
      input.clientLastModified,
      probed.createdAt,
      JSON.stringify({ ...probed.raw, createdAtSource: probed.createdAtSource }),
      verdict.accepted ? 1 : 0,
      verdict.flagged ? 1 : 0,
      verdict.flagReason ?? null,
      verdict.rejectReason ?? null,
      uploadedAt,
    );

  logEvent(input.teamId, verdict.accepted ? "UPLOAD_ACCEPTED" : "UPLOAD_REJECTED", {
    stopId: input.stopId,
    kind: input.kind,
    sideChallengeType: input.sideChallengeType,
    reason: verdict.rejectReason ?? verdict.flagReason,
  });

  return {
    uploadId: Number(result.lastInsertRowid),
    accepted: verdict.accepted,
    flagged: verdict.flagged,
    ...(verdict.rejectReason !== undefined && { rejectReason: verdict.rejectReason }),
  };
}

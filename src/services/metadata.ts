import { spawn } from "node:child_process";
import exifr from "exifr";
import type { Challenge, MediaKind } from "../content/types.js";

/**
 * Sanity checks on uploaded media.
 *
 * Read the README section "Why freshness checks are best-effort" before
 * tightening any of this. Short version: iOS does not reliably preserve a
 * timestamp, so a missing date FLAGS an upload for review rather than
 * rejecting it. The duplicate-hash check in uploads.ts is the rule that
 * actually holds, because it needs no metadata at all.
 */

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
  "video/3gpp",
  "video/mpeg",
]);

const PHOTO_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "image/gif",
]);

const VIDEO_EXTS = new Set([".mp4", ".mov", ".m4v", ".webm", ".3gp", ".mpeg", ".mpg"]);
const PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif"]);

export function classify(mime: string, filename: string): "video" | "photo" | "other" {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  if (VIDEO_MIMES.has(mime) || VIDEO_EXTS.has(ext)) return "video";
  if (PHOTO_MIMES.has(mime) || PHOTO_EXTS.has(ext)) return "photo";
  return "other";
}

export interface ProbeResult {
  /** Epoch ms the media was actually shot, when we can prove it. */
  createdAt: number | null;
  /** Where createdAt came from, for the admin view. */
  createdAtSource: "exif" | "video-tag" | "client" | null;
  durationSec: number | null;
  raw: Record<string, unknown>;
}

function runFfprobe(filePath: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
      { stdio: ["ignore", "pipe", "ignore"] },
    );

    let out = "";
    proc.stdout.on("data", (c) => {
      out += c;
    });
    // Missing ffprobe binary, bad file, whatever -- degrade, never throw.
    proc.on("error", () => resolve(null));
    proc.on("close", (code) => {
      if (code !== 0) return resolve(null);
      try {
        resolve(JSON.parse(out) as Record<string, unknown>);
      } catch {
        resolve(null);
      }
    });

    // A pathological file should not wedge an upload.
    setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 15_000).unref();
  });
}

function parseDate(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/**
 * Pulls whatever we can out of the file itself, falling back to the timestamp
 * the browser reported for the file on the user's device.
 */
export async function probe(
  filePath: string,
  kind: "video" | "photo" | "other",
  clientLastModified: number | null,
): Promise<ProbeResult> {
  let createdAt: number | null = null;
  let createdAtSource: ProbeResult["createdAtSource"] = null;
  let durationSec: number | null = null;
  const raw: Record<string, unknown> = {};

  if (kind === "photo") {
    try {
      const exif = (await exifr.parse(filePath, {
        tiff: true,
        exif: true,
        translateValues: true,
      })) as Record<string, unknown> | undefined;
      if (exif) {
        raw.exif = {
          DateTimeOriginal: exif.DateTimeOriginal,
          CreateDate: exif.CreateDate,
          Make: exif.Make,
          Model: exif.Model,
        };
        createdAt = parseDate(exif.DateTimeOriginal) ?? parseDate(exif.CreateDate);
        if (createdAt !== null) createdAtSource = "exif";
      }
    } catch {
      // Screenshots, stripped images, unsupported formats: no EXIF, no problem.
    }
  }

  if (kind === "video") {
    const probed = await runFfprobe(filePath);
    if (probed) {
      const format = probed.format as Record<string, unknown> | undefined;
      const tags = format?.tags as Record<string, unknown> | undefined;
      raw.video = {
        durationSec: format?.duration,
        formatName: format?.format_name,
        creationTime: tags?.creation_time,
      };
      const duration = Number.parseFloat(String(format?.duration ?? ""));
      if (!Number.isNaN(duration)) durationSec = duration;
      createdAt = parseDate(tags?.creation_time);
      if (createdAt !== null) createdAtSource = "video-tag";
    }
  }

  if (createdAt === null && clientLastModified !== null) {
    createdAt = clientLastModified;
    createdAtSource = "client";
  }

  return { createdAt, createdAtSource, durationSec, raw };
}

export interface Verdict {
  accepted: boolean;
  rejectReason?: string;
  flagged: boolean;
  flagReason?: string;
}

export interface EvaluateInput {
  challenge: Challenge;
  kind: "video" | "photo" | "other";
  sizeBytes: number;
  uploadedAt: number;
  probe: Pick<ProbeResult, "createdAt" | "createdAtSource" | "durationSec">;
  /** Server-wide ceiling from MAX_UPLOAD_MB. */
  maxUploadBytes: number;
}

function kindMatches(accept: MediaKind, kind: "video" | "photo" | "other"): boolean {
  if (kind === "other") return false;
  if (accept === "any") return true;
  return accept === kind;
}

/**
 * Pure rules, no IO -- this is the function the tests exercise.
 * Order matters: cheapest and most certain rejections first.
 */
export function evaluate(input: EvaluateInput): Verdict {
  const { challenge, kind, sizeBytes, uploadedAt, probe: p } = input;

  if (!kindMatches(challenge.accept, kind)) {
    const wanted = challenge.accept === "any" ? "a photo or video" : `a ${challenge.accept}`;
    return { accepted: false, flagged: false, rejectReason: `That needs to be ${wanted}.` };
  }

  const limitBytes = Math.min(
    input.maxUploadBytes,
    challenge.maxFileSizeMb ? challenge.maxFileSizeMb * 1024 * 1024 : Number.POSITIVE_INFINITY,
  );
  if (sizeBytes > limitBytes) {
    const mb = Math.round(limitBytes / 1024 / 1024);
    return { accepted: false, flagged: false, rejectReason: `File is too big (max ${mb}MB).` };
  }

  if (kind === "video" && p.durationSec !== null) {
    if (challenge.minDurationSec !== undefined && p.durationSec < challenge.minDurationSec) {
      return {
        accepted: false,
        flagged: false,
        rejectReason: `Too short -- needs to be at least ${challenge.minDurationSec} seconds.`,
      };
    }
    if (challenge.maxDurationSec !== undefined && p.durationSec > challenge.maxDurationSec) {
      return {
        accepted: false,
        flagged: false,
        rejectReason: `Too long -- keep it under ${challenge.maxDurationSec} seconds.`,
      };
    }
  }

  if (challenge.maxAgeMinutes !== undefined) {
    if (p.createdAt === null) {
      // Nothing to check against. Let them through, but leave a trail.
      return {
        accepted: true,
        flagged: true,
        flagReason: "No timestamp could be read from this file.",
      };
    }

    const ageMs = uploadedAt - p.createdAt;
    const limitMs = challenge.maxAgeMinutes * 60 * 1000;

    // A timestamp meaningfully in the future means a wrong device clock or a
    // wound-back one. Do not reject on it, but do flag it.
    if (ageMs < -5 * 60 * 1000) {
      return {
        accepted: true,
        flagged: true,
        flagReason: "File claims to be from the future -- check the device clock.",
      };
    }

    if (ageMs > limitMs) {
      const minutes = Math.round(ageMs / 60000);
      return {
        accepted: false,
        flagged: false,
        rejectReason:
          `That was taken ${minutes} minutes ago. Shoot it now -- ` +
          `it has to be from the last ${challenge.maxAgeMinutes} minutes.`,
      };
    }

    // Only the device's own file date backed this up, which is trivially
    // faked. Good enough to play on, worth a look afterwards.
    if (p.createdAtSource === "client") {
      return {
        accepted: true,
        flagged: true,
        flagReason: "Freshness came from the device file date, not embedded metadata.",
      };
    }
  }

  return { accepted: true, flagged: false };
}

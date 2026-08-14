import { Router } from "express";
import multer from "multer";
import { config } from "../config.js";
import { crawl, stopByIndex } from "../content/index.js";
import type { Challenge, SideChallengeType } from "../content/types.js";
import { requireTeam } from "./auth.js";
import {
  buildPlayerView,
  completeChallenge,
  currentStopRow,
  submitAnswer,
  unlockHint,
} from "../domain/state.js";
import { processUpload } from "../services/uploads.js";
import fs from "node:fs";

const upload = multer({
  dest: config.tmpDir,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
});

export const playRouter: Router = Router();

// requireTeam goes on each route rather than router-wide: this router is
// mounted at the root, so a blanket .use() would also intercept /admin.
playRouter.get("/play", requireTeam, (req, res) => {
  res.render("play", { title: crawl.title, view: buildPlayerView(req.team!) });
});

/** Polled by every phone in a team so they all see the same screen. */
playRouter.get("/api/state", requireTeam, (req, res) => {
  res.json(buildPlayerView(req.team!));
});

const SIDE_CHALLENGE_TYPES = new Set<string>(["shot", "beer", "selfie"]);

/**
 * One endpoint for both kinds of upload. `kind=CHALLENGE` unlocks the quiz,
 * `kind=HINT` buys the next hint.
 */
playRouter.post("/api/upload", requireTeam, upload.single("media"), async (req, res) => {
  const team = req.team!;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "no_file", message: "No file was uploaded." });
    return;
  }

  const cleanup = () => fs.promises.unlink(file.path).catch(() => {});

  const row = currentStopRow(team.id);
  const stop = stopByIndex(row.stop_index);
  if (!stop) {
    await cleanup();
    res.status(400).json({ error: "finished", message: "You have already finished the crawl." });
    return;
  }

  const kind = req.body?.kind === "HINT" ? "HINT" : "CHALLENGE";

  // Uploads must match the phase the team is actually in, or a team could
  // bank hint uploads before reaching the quiz.
  if (kind === "CHALLENGE" && row.phase !== "CHALLENGE") {
    await cleanup();
    res.status(409).json({ error: "wrong_phase", message: "You've already done this challenge." });
    return;
  }
  if (kind === "HINT" && row.phase !== "QUIZ") {
    await cleanup();
    res.status(409).json({ error: "wrong_phase", message: "No hint to buy right now." });
    return;
  }

  let challenge: Challenge;
  let sideChallengeType: SideChallengeType | undefined;

  if (kind === "CHALLENGE") {
    challenge = stop.challenge;
  } else {
    const nextHint = stop.quiz?.hints[row.hints_unlocked];
    if (!nextHint) {
      await cleanup();
      res.status(409).json({ error: "no_hints", message: "There are no hints left here." });
      return;
    }
    // The client says which side-challenge it did, but the server decides
    // which one was owed.
    const claimed = String(req.body?.sideChallengeType ?? "");
    if (SIDE_CHALLENGE_TYPES.has(claimed) && claimed !== nextHint.requires) {
      await cleanup();
      res.status(409).json({
        error: "wrong_side_challenge",
        message: `That hint costs a ${nextHint.requires}, not a ${claimed}.`,
      });
      return;
    }
    sideChallengeType = nextHint.requires;
    challenge = crawl.sideChallenges[sideChallengeType];
  }

  const clientLastModifiedRaw = Number.parseInt(String(req.body?.lastModified ?? ""), 10);
  const clientLastModified = Number.isNaN(clientLastModifiedRaw) ? null : clientLastModifiedRaw;

  try {
    const result = await processUpload({
      teamId: team.id,
      stopId: stop.id,
      kind,
      ...(sideChallengeType !== undefined && { sideChallengeType }),
      challenge,
      tempPath: file.path,
      originalName: file.originalname,
      mime: file.mimetype,
      sizeBytes: file.size,
      clientLastModified,
    });

    if (!result.accepted) {
      res.status(422).json({
        error: "rejected",
        message: result.rejectReason ?? "That upload was not accepted.",
        view: buildPlayerView(team),
      });
      return;
    }

    let revealedHint: string | null = null;
    if (kind === "CHALLENGE") {
      completeChallenge(team.id, stop.id);
    } else {
      revealedHint = unlockHint(team.id, stop.id);
    }

    res.json({ ok: true, revealedHint, view: buildPlayerView(team) });
  } catch (err) {
    await cleanup();
    throw err;
  }
});

playRouter.post("/api/answer", requireTeam, (req, res) => {
  const team = req.team!;
  const row = currentStopRow(team.id);
  const stop = stopByIndex(row.stop_index);

  if (!stop) {
    res.status(400).json({ error: "finished" });
    return;
  }

  const submitted = String(req.body?.answer ?? "");
  const result = submitAnswer(team.id, stop.id, submitted);

  res.json({
    correct: result.correct,
    finished: result.finished ?? false,
    successText: result.successText ?? null,
    message: result.correct ? null : "Not it. Try again, or buy a hint.",
    view: buildPlayerView(team),
  });
});

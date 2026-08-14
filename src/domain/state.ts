import { db, logEvent, now } from "../db/index.js";
import { crawl, indexOfStop, stopByIndex, stopCount } from "../content/index.js";
import type { Hint, SideChallengeType, Stop } from "../content/types.js";
import { matchesAnswer } from "./answers.js";

/**
 * Every progression rule lives here. Routes call these functions and render the
 * result -- they never write to team_stops themselves.
 *
 * Per stop: CHALLENGE -> (upload accepted) -> QUIZ -> (right answer) -> DONE,
 * then the next stop opens at CHALLENGE.
 */

export type Phase = "CHALLENGE" | "QUIZ" | "DONE";

export interface TeamRow {
  id: number;
  name: string;
  normalized_name: string;
  created_at: number;
  finished_at: number | null;
}

export interface TeamStopRow {
  team_id: number;
  stop_id: string;
  stop_index: number;
  phase: Phase;
  hints_unlocked: number;
  entered_at: number;
  challenge_passed_at: number | null;
  quiz_solved_at: number | null;
}

/** What the player UI needs to render. Deliberately leaks nothing about future stops. */
export interface PlayerView {
  team: { id: number; name: string };
  finished: boolean;
  finishText?: string;
  stopNumber: number; // 1-based, for display
  stopCount: number;
  /**
   * The bar the team is standing in. Not a spoiler: they typed this name to
   * get here, and on stop 1 it is how they know where to start.
   */
  stopName?: string;
  phase: Phase;
  challenge?: { prompt: string; accept: string; stopId: string };
  quiz?: {
    question: string;
    stopId: string;
    hints: string[]; // only the ones already unlocked
    hintsRemaining: number;
    /** The side-challenge required to buy the next hint, if any are left. */
    nextHintCost: { type: SideChallengeType; prompt: string; accept: string } | null;
  };
}

const selectStop = db.prepare<[number, string], TeamStopRow>(
  `SELECT * FROM team_stops WHERE team_id = ? AND stop_id = ?`,
);

const selectCurrentStop = db.prepare<[number], TeamStopRow>(
  `SELECT * FROM team_stops WHERE team_id = ? ORDER BY stop_index DESC LIMIT 1`,
);

const insertStop = db.prepare(
  `INSERT INTO team_stops (team_id, stop_id, stop_index, phase, entered_at)
   VALUES (?, ?, ?, 'CHALLENGE', ?)
   ON CONFLICT (team_id, stop_id) DO NOTHING`,
);

/** Opens stop 0 for a team that has just been created. Safe to call repeatedly. */
export function ensureStarted(teamId: number): TeamStopRow {
  const existing = selectCurrentStop.get(teamId);
  if (existing) return existing;

  const first = stopByIndex(0);
  if (!first) throw new Error("crawl has no stops");
  insertStop.run(teamId, first.id, 0, now());
  logEvent(teamId, "STOP_ENTERED", { stopId: first.id, stopIndex: 0 });
  return selectStop.get(teamId, first.id)!;
}

export function currentStopRow(teamId: number): TeamStopRow {
  return ensureStarted(teamId);
}

/** The stop definition a team is currently on, or null once they have finished. */
export function currentStop(teamId: number): { row: TeamStopRow; stop: Stop } | null {
  const row = currentStopRow(teamId);
  const stop = stopByIndex(row.stop_index);
  if (!stop) return null;
  return { row, stop };
}

export function isFinished(teamId: number): boolean {
  const row = currentStopRow(teamId);
  return row.phase === "DONE" && row.stop_index >= stopCount - 1;
}

/**
 * Called when a CHALLENGE upload has passed its metadata checks.
 * Idempotent: a second accepted upload for the same stop changes nothing.
 */
export function completeChallenge(teamId: number, stopId: string): void {
  const row = selectStop.get(teamId, stopId);
  if (!row || row.phase !== "CHALLENGE") return;

  const stop = stopByIndex(row.stop_index);
  if (!stop) return;

  const timestamp = now();

  // The last stop has no riddle -- there is nowhere left to send anyone -- so
  // passing its challenge ends the crawl rather than opening a quiz.
  if (!stop.quiz) {
    db.transaction(() => {
      db.prepare(
        `UPDATE team_stops SET phase = 'DONE', challenge_passed_at = ?, quiz_solved_at = ?
         WHERE team_id = ? AND stop_id = ? AND phase = 'CHALLENGE'`,
      ).run(timestamp, timestamp, teamId, stopId);
      db.prepare(`UPDATE teams SET finished_at = ? WHERE id = ? AND finished_at IS NULL`).run(
        timestamp,
        teamId,
      );
    })();
    logEvent(teamId, "CHALLENGE_PASSED", { stopId });
    logEvent(teamId, "FINISHED");
    return;
  }

  db.prepare(
    `UPDATE team_stops SET phase = 'QUIZ', challenge_passed_at = ?
     WHERE team_id = ? AND stop_id = ? AND phase = 'CHALLENGE'`,
  ).run(timestamp, teamId, stopId);
  logEvent(teamId, "CHALLENGE_PASSED", { stopId });
}

export interface AnswerResult {
  correct: boolean;
  /** Set on a correct answer for the last stop. */
  finished?: boolean;
  successText?: string;
}

/** Grades a quiz answer and, if right, advances the team to the next stop. */
export function submitAnswer(teamId: number, stopId: string, submitted: string): AnswerResult {
  const row = selectStop.get(teamId, stopId);
  const stop = row ? stopByIndex(row.stop_index) : undefined;
  if (!row || !stop?.quiz) return { correct: false };

  // Answering is only possible once the challenge is done, and only once.
  if (row.phase !== "QUIZ") return { correct: false };

  const correct = matchesAnswer(submitted, stop.quiz.answers);

  db.prepare(
    `INSERT INTO quiz_attempts (team_id, stop_id, submitted, correct, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(teamId, stopId, submitted, correct ? 1 : 0, now());

  if (!correct) {
    logEvent(teamId, "ANSWER_WRONG", { stopId, submitted });
    return { correct: false };
  }

  const timestamp = now();
  const nextIndex = row.stop_index + 1;
  const nextStop = stopByIndex(nextIndex);

  db.transaction(() => {
    db.prepare(
      `UPDATE team_stops SET phase = 'DONE', quiz_solved_at = ?
       WHERE team_id = ? AND stop_id = ?`,
    ).run(timestamp, teamId, stopId);

    if (nextStop) {
      insertStop.run(teamId, nextStop.id, nextIndex, timestamp);
    } else {
      db.prepare(`UPDATE teams SET finished_at = ? WHERE id = ? AND finished_at IS NULL`).run(
        timestamp,
        teamId,
      );
    }
  })();

  logEvent(teamId, "ANSWER_CORRECT", { stopId, submitted });
  if (nextStop) {
    logEvent(teamId, "STOP_ENTERED", { stopId: nextStop.id, stopIndex: nextIndex });
  } else {
    logEvent(teamId, "FINISHED");
  }

  return {
    correct: true,
    finished: !nextStop,
    ...(stop.quiz.successText !== undefined && { successText: stop.quiz.successText }),
  };
}

/** The hint a team would get next at this stop, or null if they have them all. */
export function nextHintFor(stop: Stop, hintsUnlocked: number): Hint | null {
  return stop.quiz?.hints[hintsUnlocked] ?? null;
}

/**
 * Called when a HINT side-challenge upload has passed its checks: reveals one
 * more hint. Returns the revealed text, or null if there was nothing to reveal.
 */
export function unlockHint(teamId: number, stopId: string): string | null {
  const row = selectStop.get(teamId, stopId);
  const stop = row ? stopByIndex(row.stop_index) : undefined;
  if (!row || !stop?.quiz || row.phase !== "QUIZ") return null;

  const hint = nextHintFor(stop, row.hints_unlocked);
  if (!hint) return null;

  db.prepare(
    `UPDATE team_stops SET hints_unlocked = hints_unlocked + 1
     WHERE team_id = ? AND stop_id = ?`,
  ).run(teamId, stopId);
  logEvent(teamId, "HINT_UNLOCKED", { stopId, hintIndex: row.hints_unlocked });

  return hint.text;
}

function sideChallengeInfo(type: SideChallengeType) {
  const sc = crawl.sideChallenges[type];
  return { type, prompt: sc.prompt, accept: sc.accept };
}

/** Assembles everything the player UI shows for a team right now. */
export function buildPlayerView(team: TeamRow): PlayerView {
  const row = currentStopRow(team.id);
  const stop = stopByIndex(row.stop_index);
  const finished = !stop || (row.phase === "DONE" && row.stop_index >= stopCount - 1);

  const base = {
    team: { id: team.id, name: team.name },
    stopNumber: row.stop_index + 1,
    stopCount,
    phase: row.phase,
  };

  if (finished || !stop) {
    return { ...base, finished: true, finishText: crawl.finishText, phase: "DONE" };
  }

  if (row.phase === "CHALLENGE") {
    return {
      ...base,
      finished: false,
      stopName: stop.name,
      challenge: {
        prompt: stop.challenge.prompt,
        accept: stop.challenge.accept,
        stopId: stop.id,
      },
    };
  }

  // Phase is only ever QUIZ for a stop that has one, but keep TS honest.
  if (!stop.quiz) {
    return { ...base, finished: true, finishText: crawl.finishText, phase: "DONE" };
  }

  const unlocked = stop.quiz.hints.slice(0, row.hints_unlocked).map((h) => h.text);
  const next = nextHintFor(stop, row.hints_unlocked);

  return {
    ...base,
    finished: false,
    stopName: stop.name,
    quiz: {
      question: stop.quiz.question,
      stopId: stop.id,
      hints: unlocked,
      hintsRemaining: stop.quiz.hints.length - row.hints_unlocked,
      nextHintCost: next ? sideChallengeInfo(next.requires) : null,
    },
  };
}

/** Progress summary used by the scoreboard and the admin dashboard. */
export interface TeamProgress {
  teamId: number;
  name: string;
  stopNumber: number;
  stopCount: number;
  phase: Phase;
  hintsUsed: number;
  startedAt: number;
  finishedAt: number | null;
}

export function allTeamProgress(): TeamProgress[] {
  const teams = db.prepare<[], TeamRow>(`SELECT * FROM teams ORDER BY id`).all();

  return teams
    .map((team) => {
      const row = currentStopRow(team.id);
      const hints = db
        .prepare<[number], { total: number }>(
          `SELECT COALESCE(SUM(hints_unlocked), 0) AS total FROM team_stops WHERE team_id = ?`,
        )
        .get(team.id)!;
      return {
        teamId: team.id,
        name: team.name,
        stopNumber: row.stop_index + 1,
        stopCount,
        phase: row.phase,
        hintsUsed: hints.total,
        startedAt: team.created_at,
        finishedAt: team.finished_at,
      };
    })
    .sort((a, b) => {
      // Furthest along first; ties broken by fewer hints, then earlier start.
      const aDone = a.finishedAt !== null;
      const bDone = b.finishedAt !== null;
      if (aDone !== bDone) return aDone ? -1 : 1;
      if (a.stopNumber !== b.stopNumber) return b.stopNumber - a.stopNumber;
      if (a.hintsUsed !== b.hintsUsed) return a.hintsUsed - b.hintsUsed;
      return a.startedAt - b.startedAt;
    });
}

export { indexOfStop };

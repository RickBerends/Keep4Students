/** What kind of file a challenge will accept. */
export type MediaKind = "video" | "photo" | "any";

/** The three side-challenges a team can be asked to do to buy an extra hint. */
export type SideChallengeType = "shot" | "beer" | "selfie";

export interface Challenge {
  /** Shown to the team. Say exactly what you want on camera. */
  prompt: string;
  accept: MediaKind;
  /**
   * Reject the file unless it was created within this many minutes of upload.
   * Generous by default: a big video over pub wifi takes a while to send, and
   * iPhones do not always preserve a usable timestamp (see README).
   */
  maxAgeMinutes?: number;
  /** Video only. Stops a 0.4s "video" from counting. */
  minDurationSec?: number;
  maxDurationSec?: number;
  maxFileSizeMb?: number;
}

export interface Hint {
  text: string;
  /** The side-challenge a team must complete to unlock this hint. */
  requires: SideChallengeType;
}

export interface Quiz {
  /** The riddle pointing at the next bar. */
  question: string;
  /**
   * Every spelling you will accept. Compared after normalization
   * (case, accents and punctuation stripped) with a small typo tolerance,
   * so you do not need to list obvious variants.
   */
  answers: string[];
  /** Revealed one at a time, each paid for with a side-challenge. */
  hints: Hint[];
  /** Shown once the team gets it right -- "go to X, order a Y". */
  successText?: string;
}

export interface Stop {
  /** Stable id. Changing it after the crawl starts resets that stop's progress. */
  id: string;
  /** Bar name. Only shown to the team once they have solved the way there. */
  name: string;
  challenge: Challenge;
  /**
   * The riddle pointing at the next bar. Optional ONLY on the last stop --
   * there is nowhere left to send anyone, so passing its challenge ends the
   * crawl. Every other stop must have one or the crawl cannot progress, and
   * the server refuses to start.
   */
  quiz?: Quiz;
}

export interface Crawl {
  title: string;
  /** Teams type this to log in. Overridable at runtime with the EVENT_CODE env var. */
  eventCode: string;
  /** Shown when a team finishes the last stop. */
  finishText: string;
  /** Side-challenge prompts, reused across every stop. */
  sideChallenges: Record<SideChallengeType, Challenge>;
  stops: Stop[];
}

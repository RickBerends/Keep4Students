import type { Crawl } from "./types.js";

/**
 * THIS IS THE FILE YOU EDIT.
 *
 * Everything about the crawl -- stops, challenges, quiz answers, hints -- lives
 * here. Add a stop by appending to `stops`. Nothing else needs to change.
 *
 * Two rules:
 *  - `id` must be unique and must not change once the crawl has started.
 *  - `answers` are matched loosely (case, accents, punctuation and small typos
 *    are forgiven), so list the real answer plus any genuinely different
 *    spelling, not every possible mistake.
 */
export const crawl: Crawl = {
  title: "Pubcrawl",
  eventCode: "CRAWL2026",
  finishText:
    "That's the lot. You've survived the whole crawl. Go find the others and " +
    "make them buy the round.",

  // Reused every time a team buys a hint. The game picks whichever the hint asks for.
  sideChallenges: {
    shot: {
      prompt: "Everyone in the team does a shot. On camera. One take.",
      accept: "video",
      maxAgeMinutes: 10,
      minDurationSec: 2,
    },
    beer: {
      prompt: "Film someone in the team finishing a beer.",
      accept: "video",
      maxAgeMinutes: 10,
      minDurationSec: 3,
    },
    selfie: {
      prompt: "Team selfie. Everyone in frame, no exceptions.",
      accept: "photo",
      maxAgeMinutes: 10,
    },
  },

  stops: [
    // ---------------------------------------------------------------------
    // Stop 1 -- where the crawl starts. Teams see this bar's name as soon as
    // they log in, so it doubles as the meeting point.
    // ---------------------------------------------------------------------
    {
      id: "stop-1",
      name: "Pizzabar Rijslust",
      challenge: {
        prompt: 'Order a Birra Moretti and "set the table". Film it.',
        accept: "video",
        maxAgeMinutes: 10,
        minDurationSec: 3,
      },
      quiz: {
        // TODO: riddle pointing at bar 2, and the answer teams must type.
        question: "PLACEHOLDER: write the riddle for bar two here.",
        answers: ["placeholder one"],
        hints: [
          { text: "PLACEHOLDER hint 1.", requires: "shot" },
          { text: "PLACEHOLDER hint 2.", requires: "beer" },
          { text: "PLACEHOLDER hint 3.", requires: "selfie" },
        ],
      },
    },

    // ---------------------------------------------------------------------
    // Stops 2+ are placeholders. Replace the prompts, answers and hints with
    // your real bars, then delete this comment.
    // ---------------------------------------------------------------------
    {
      id: "stop-2",
      name: "Placeholder bar two",
      challenge: {
        prompt: "PLACEHOLDER: upload a photo of the team with a stranger.",
        accept: "photo",
        maxAgeMinutes: 10,
      },
      quiz: {
        question: "PLACEHOLDER: write the riddle for bar three here.",
        answers: ["placeholder two"],
        hints: [
          { text: "PLACEHOLDER hint 1.", requires: "shot" },
          { text: "PLACEHOLDER hint 2.", requires: "selfie" },
        ],
      },
    },
    {
      id: "stop-3",
      name: "Placeholder bar three",
      challenge: {
        prompt: "PLACEHOLDER: upload a video of the team's worst dance move.",
        accept: "video",
        maxAgeMinutes: 10,
        minDurationSec: 2,
      },
      quiz: {
        question: "PLACEHOLDER: write the final riddle here.",
        answers: ["placeholder three"],
        hints: [{ text: "PLACEHOLDER hint 1.", requires: "beer" }],
      },
    },
  ],
};

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

  // The bars are real and in walking order. The RIDDLES are not written yet --
  // every `quiz` below is a placeholder, and the server prints a loud warning
  // at boot listing them. Replace `question` and `answers` and it is playable.
  stops: [
    // ---------------------------------------------------------------------
    // Stop 1 -- where the crawl starts. Teams see this bar's name the moment
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
        // TODO: riddle pointing at the Irish pub.
        question: "PLACEHOLDER: write the riddle pointing at the Irish pub.",
        answers: ["PLACEHOLDER irish pub"],
        hints: [
          { text: "PLACEHOLDER hint 1.", requires: "shot" },
          { text: "PLACEHOLDER hint 2.", requires: "beer" },
          { text: "PLACEHOLDER hint 3.", requires: "selfie" },
        ],
      },
    },

    {
      id: "stop-2",
      name: "Irish pub",
      challenge: {
        prompt: 'Order a Guinness and "split the G". Film the first sip.',
        accept: "video",
        maxAgeMinutes: 10,
        minDurationSec: 3,
      },
      quiz: {
        // TODO: riddle pointing at the nacho bar.
        question: "PLACEHOLDER: write the riddle pointing at the nacho bar.",
        answers: ["PLACEHOLDER nacho bar"],
        hints: [
          { text: "PLACEHOLDER hint 1.", requires: "shot" },
          { text: "PLACEHOLDER hint 2.", requires: "beer" },
          { text: "PLACEHOLDER hint 3.", requires: "selfie" },
        ],
      },
    },

    // ---------------------------------------------------------------------
    // Last stop: no quiz, because there is nowhere left to send anyone.
    // Passing this challenge ends the crawl.
    // ---------------------------------------------------------------------
    {
      id: "stop-3",
      name: "Nacho bar",
      challenge: {
        prompt:
          "What's the accumulative sum of your numbers? Drink as many beers " +
          "as your combined numbers before continuing. Film it.",
        accept: "video",
        // Deliberately loose: this one takes a while, and the freshness check
        // reads when filming STARTED. A 10-minute window would fail a team
        // that filmed the whole thing. See the README.
        maxAgeMinutes: 90,
        minDurationSec: 3,
      },
    },
  ],
};

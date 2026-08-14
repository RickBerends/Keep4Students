import { describe, expect, it } from "vitest";
import { classify, evaluate, type EvaluateInput } from "./metadata.js";
import type { Challenge } from "../content/types.js";

const MB = 1024 * 1024;
const NOW = 1_700_000_000_000;

const videoChallenge: Challenge = {
  prompt: "drink a beer",
  accept: "video",
  maxAgeMinutes: 10,
  minDurationSec: 3,
};

function check(overrides: Partial<EvaluateInput> = {}) {
  const base: EvaluateInput = {
    challenge: videoChallenge,
    kind: "video",
    sizeBytes: 20 * MB,
    uploadedAt: NOW,
    probe: {
      createdAt: NOW - 60_000, // shot a minute ago
      createdAtSource: "video-tag",
      durationSec: 8,
    },
    maxUploadBytes: 400 * MB,
  };
  return evaluate({ ...base, ...overrides, probe: { ...base.probe, ...overrides.probe } });
}

describe("classify", () => {
  it("recognises iPhone media by mime type", () => {
    expect(classify("video/quicktime", "IMG_0001.MOV")).toBe("video");
    expect(classify("image/heic", "IMG_0002.HEIC")).toBe("photo");
    expect(classify("image/jpeg", "IMG_0003.JPG")).toBe("photo");
  });

  it("falls back to the extension when the mime type is useless", () => {
    expect(classify("application/octet-stream", "clip.mov")).toBe("video");
    expect(classify("application/octet-stream", "pic.heic")).toBe("photo");
  });

  it("rejects anything that is not media", () => {
    expect(classify("text/plain", "notes.txt")).toBe("other");
    expect(classify("application/pdf", "map.pdf")).toBe("other");
  });
});

describe("evaluate", () => {
  it("accepts a fresh video of the right length", () => {
    expect(check()).toEqual({ accepted: true, flagged: false });
  });

  it("rejects the wrong media type", () => {
    const verdict = check({ kind: "photo" });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejectReason).toMatch(/video/);
  });

  it("rejects non-media outright, even when the challenge accepts anything", () => {
    const verdict = check({
      challenge: { ...videoChallenge, accept: "any" },
      kind: "other",
    });
    expect(verdict.accepted).toBe(false);
  });

  it("rejects files over the server ceiling", () => {
    const verdict = check({ sizeBytes: 500 * MB });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejectReason).toMatch(/too big/);
  });

  it("rejects files over a per-challenge size limit", () => {
    const verdict = check({
      challenge: { ...videoChallenge, maxFileSizeMb: 10 },
      sizeBytes: 20 * MB,
    });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejectReason).toMatch(/max 10MB/);
  });

  it("rejects a video that is too short to show anything", () => {
    const verdict = check({ probe: { durationSec: 0.4 } as never });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejectReason).toMatch(/Too short/);
  });

  it("rejects an old video from the camera roll", () => {
    const verdict = check({ probe: { createdAt: NOW - 3 * 60 * 60 * 1000 } as never });
    expect(verdict.accepted).toBe(false);
    expect(verdict.rejectReason).toMatch(/minutes ago/);
  });

  it("accepts but flags media with no readable timestamp", () => {
    const verdict = check({ probe: { createdAt: null, createdAtSource: null } as never });
    expect(verdict.accepted).toBe(true);
    expect(verdict.flagged).toBe(true);
    expect(verdict.flagReason).toMatch(/No timestamp/);
  });

  it("accepts but flags freshness that rests only on the device file date", () => {
    const verdict = check({ probe: { createdAtSource: "client" } as never });
    expect(verdict.accepted).toBe(true);
    expect(verdict.flagged).toBe(true);
    expect(verdict.flagReason).toMatch(/device file date/);
  });

  it("accepts but flags a timestamp from the future rather than blocking the team", () => {
    const verdict = check({ probe: { createdAt: NOW + 60 * 60 * 1000 } as never });
    expect(verdict.accepted).toBe(true);
    expect(verdict.flagged).toBe(true);
    expect(verdict.flagReason).toMatch(/future/);
  });

  it("skips the freshness rule entirely when a challenge does not set one", () => {
    const { maxAgeMinutes: _omit, ...noAge } = videoChallenge;
    const verdict = check({
      challenge: noAge,
      probe: { createdAt: NOW - 5 * 24 * 60 * 60 * 1000 } as never,
    });
    expect(verdict).toEqual({ accepted: true, flagged: false });
  });
});

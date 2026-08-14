import { describe, expect, it } from "vitest";
import { editDistance, matchesAnswer, normalize } from "./answers.js";

describe("normalize", () => {
  it("lowercases and trims", () => {
    expect(normalize("  Bet Koolen  ")).toBe("bet koolen");
  });

  it("strips accents", () => {
    expect(normalize("Café Zoë")).toBe("cafe zoe");
  });

  it("turns punctuation into separators", () => {
    expect(normalize("St.Jan")).toBe("st jan");
    expect(normalize("'t Pumpke!")).toBe("t pumpke");
  });

  it("collapses runs of whitespace", () => {
    expect(normalize("bet    koolen")).toBe("bet koolen");
  });
});

describe("editDistance", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("abc", "abc", 2)).toBe(0);
  });

  it("counts single edits", () => {
    expect(editDistance("kolen", "koolen", 2)).toBe(1); // insertion
    expect(editDistance("koolen", "koolan", 2)).toBe(1); // substitution
    expect(editDistance("koolenn", "koolen", 2)).toBe(1); // deletion
  });

  it("bails out past the cap instead of computing the true distance", () => {
    expect(editDistance("aaaaaa", "zzzzzz", 2)).toBeGreaterThan(2);
  });
});

describe("matchesAnswer", () => {
  const answers = ["bet koolen"];

  it("accepts the exact answer", () => {
    expect(matchesAnswer("bet koolen", answers)).toBe(true);
  });

  it("forgives case, spacing and punctuation", () => {
    expect(matchesAnswer("Bet  Koolen", answers)).toBe(true);
    expect(matchesAnswer("BET KOOLEN!", answers)).toBe(true);
    expect(matchesAnswer("  bet koolen ", answers)).toBe(true);
  });

  it("forgives a typo or two on a long answer", () => {
    expect(matchesAnswer("bet kolen", answers)).toBe(true);
    expect(matchesAnswer("bet koolenn", answers)).toBe(true);
  });

  it("rejects a genuinely different answer", () => {
    expect(matchesAnswer("de kroeg", answers)).toBe(false);
    expect(matchesAnswer("bet", answers)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(matchesAnswer("", answers)).toBe(false);
    expect(matchesAnswer("   ", answers)).toBe(false);
  });

  it("gives short answers no typo slack, so near-misses stay distinct", () => {
    expect(matchesAnswer("bar", ["bar"])).toBe(true);
    expect(matchesAnswer("car", ["bar"])).toBe(false);
  });

  it("accepts any of several listed spellings", () => {
    expect(matchesAnswer("the pump", ["'t pumpke", "the pump"])).toBe(true);
    expect(matchesAnswer("t pumpke", ["'t pumpke", "the pump"])).toBe(true);
  });
});

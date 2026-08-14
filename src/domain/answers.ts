/**
 * Answer matching for quiz questions and team names.
 *
 * The people typing these are drunk, on a phone keyboard, in the dark. The
 * matcher forgives case, accents, punctuation, stray whitespace and one typo.
 * It does not forgive a genuinely wrong answer.
 */

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents left behind by NFD
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation -> space, so "st.jan" == "st jan"
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance, capped: stops early once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  // Single row, rolled forward. Classic DP, just without the full matrix.
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current: number[] = [i];
    let rowBest = i;
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = previous[j]! + 1;
      const insertion = current[j - 1]! + 1;
      const best = Math.min(substitution, deletion, insertion);
      current[j] = best;
      if (best < rowBest) rowBest = best;
    }
    if (rowBest > max) return max + 1; // no cell in this row can recover
    previous = current;
  }

  return previous[b.length]!;
}

/**
 * How much typo slack a given answer gets. Short answers get none -- with a
 * 3-letter answer, one edit away is a different word.
 */
function toleranceFor(answer: string): number {
  if (answer.length <= 4) return 0;
  if (answer.length <= 10) return 1;
  return 2;
}

/** True when `submitted` should be accepted as one of `accepted`. */
export function matchesAnswer(submitted: string, accepted: readonly string[]): boolean {
  const guess = normalize(submitted);
  if (guess === "") return false;

  return accepted.some((candidate) => {
    const target = normalize(candidate);
    if (target === "") return false;
    if (guess === target) return true;

    const tolerance = toleranceFor(target);
    if (tolerance === 0) return false;
    return editDistance(guess, target, tolerance) <= tolerance;
  });
}

/**
 * Team names are matched exactly (after normalization) rather than fuzzily --
 * two teams called "the eagles" and "the beagles" must stay separate.
 */
export function normalizeTeamName(name: string): string {
  return normalize(name);
}

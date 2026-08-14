import { config } from "../config.js";
import { crawl } from "./crawl.js";
import type { Stop } from "./types.js";

export { crawl };
export type * from "./types.js";

/**
 * Fail loudly at boot rather than halfway through the night. A typo in
 * crawl.ts is far cheaper to find here than in a bar at 23:00.
 */
function validate(): void {
  const problems: string[] = [];
  const unfinished: string[] = [];

  if (crawl.stops.length === 0) problems.push("crawl has no stops");

  const seen = new Set<string>();
  for (const [i, stop] of crawl.stops.entries()) {
    const where = `stop ${i + 1} (${stop.id})`;
    const isLast = i === crawl.stops.length - 1;

    if (seen.has(stop.id)) problems.push(`${where}: duplicate stop id`);
    seen.add(stop.id);
    if (!stop.challenge.prompt.trim()) problems.push(`${where}: empty challenge prompt`);

    if (!stop.quiz) {
      // Only forgivable on the last stop, where the challenge ends the crawl.
      if (!isLast) problems.push(`${where}: needs a quiz -- only the last stop may omit one`);
      continue;
    }

    if (!stop.quiz.question.trim()) problems.push(`${where}: empty quiz question`);
    if (stop.quiz.answers.length === 0) problems.push(`${where}: no accepted answers`);
    if (stop.quiz.answers.some((a) => !a.trim())) problems.push(`${where}: blank answer`);

    // Content still being written. Not fatal -- you want to be able to run the
    // app while filling it in -- but loud, so it cannot reach a real crawl.
    const text = [stop.quiz.question, ...stop.quiz.answers].join(" ");
    if (/PLACEHOLDER/i.test(text)) unfinished.push(`${where} "${stop.name}"`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid crawl content in src/content/crawl.ts:\n  - ${problems.join("\n  - ")}`);
  }

  if (unfinished.length > 0) {
    console.warn(
      `\n  !! ${unfinished.length} stop(s) still have PLACEHOLDER riddles and cannot be solved:`,
    );
    for (const line of unfinished) console.warn(`     - ${line}`);
    console.warn("     Fill them in in src/content/crawl.ts before the crawl.\n");
  }
}

validate();

export const eventCode: string = config.eventCodeOverride ?? crawl.eventCode;

export const stopCount: number = crawl.stops.length;

export function stopByIndex(index: number): Stop | undefined {
  return crawl.stops[index];
}

export function indexOfStop(stopId: string): number {
  return crawl.stops.findIndex((s) => s.id === stopId);
}

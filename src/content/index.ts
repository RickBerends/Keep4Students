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

  if (crawl.stops.length === 0) problems.push("crawl has no stops");

  const seen = new Set<string>();
  for (const [i, stop] of crawl.stops.entries()) {
    const where = `stop ${i} (${stop.id})`;
    if (seen.has(stop.id)) problems.push(`${where}: duplicate stop id`);
    seen.add(stop.id);
    if (!stop.challenge.prompt.trim()) problems.push(`${where}: empty challenge prompt`);
    if (!stop.quiz.question.trim()) problems.push(`${where}: empty quiz question`);
    if (stop.quiz.answers.length === 0) problems.push(`${where}: no accepted answers`);
    if (stop.quiz.answers.some((a) => !a.trim())) problems.push(`${where}: blank answer`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid crawl content in src/content/crawl.ts:\n  - ${problems.join("\n  - ")}`);
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

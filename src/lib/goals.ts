import "server-only";

import { getDayNotes, mergeDayNotes } from "@/lib/dayLog";
import type { GoalItem, GoalsDTO } from "@/lib/types";

/**
 * Short-term goals are stored on a SENTINEL date so they never roll over with
 * the real daily log. They live in the same notes-blob mechanism as habits,
 * under `goals_week_items` / `goals_semester_items`.
 */
export const GOALS_SENTINEL_DATE = "2000-01-01";

export type GoalScope = "week" | "semester";

function parseItems(value: unknown): GoalItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is { text: unknown; done: unknown } => !!x && typeof x === "object")
    .map((x) => ({ text: String(x.text ?? ""), done: Boolean(x.done) }))
    .filter((x) => x.text.length > 0);
}

export async function getGoals(): Promise<GoalsDTO> {
  const notes = await getDayNotes(GOALS_SENTINEL_DATE);
  return {
    week: parseItems(notes.goals_week_items),
    semester: parseItems(notes.goals_semester_items),
  };
}

export async function setGoals(
  scope: GoalScope,
  items: GoalItem[],
): Promise<GoalsDTO> {
  const clean = parseItems(items);
  const key = scope === "week" ? "goals_week_items" : "goals_semester_items";
  await mergeDayNotes(GOALS_SENTINEL_DATE, { [key]: clean });
  return getGoals();
}

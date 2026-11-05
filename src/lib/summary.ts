import "server-only";

import { db, USER_ID } from "@/lib/db";
import { getDayNotes } from "@/lib/dayLog";
import { localDateKey } from "@/lib/localDate";
import { HABITS } from "@/lib/config/habits";
import { queryTasks } from "@/lib/tasks";

/**
 * Compose a short end-of-day summary from the day's real activity.
 *
 * For now this is a deterministic template. The signature returns a plain
 * string so a later night can swap the body for a Claude call without touching
 * the API route.
 */
export async function summarizeDay(): Promise<string> {
  const today = localDateKey();

  const todays = await queryTasks({ urgency: "today" });
  const doneCount = todays.filter((t) => t.done).length;
  const openCount = todays.filter((t) => !t.done).length;

  const notes = await getDayNotes(today);
  const habits = (notes.habits ?? {}) as { done?: unknown };
  const habitsDone = Array.isArray(habits.done) ? habits.done.length : 0;
  const habitsTotal = HABITS.length;

  const { count } = await db()
    .from("raw_captures")
    .select("id", { count: "exact", head: true })
    .eq("user_id", USER_ID)
    .gte("created_at", `${today}T00:00:00`);
  const captureCount = count ?? 0;

  const taskWord = doneCount === 1 ? "task" : "tasks";
  const noteWord = captureCount === 1 ? "note" : "notes";

  const closing =
    openCount === 0
      ? "Clean slate for today — nice work."
      : "A focused hour could clear what's left.";

  return (
    `You completed ${doneCount} ${taskWord}, with ${openCount} still open for today. ` +
    `You kept ${habitsDone} of ${habitsTotal} habits, and captured ${captureCount} ${noteWord}. ` +
    closing
  );
}

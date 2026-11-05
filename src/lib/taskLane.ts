import type { TaskDTO, Urgency } from "@/lib/types";

/**
 * Which lane a task belongs in.
 *
 * A dated task's lane is a fact about the calendar, not a field somebody has to
 * keep filing: coursework loaded in August would otherwise sit in "Later" all
 * semester and never move. So `due_date` wins when it is set, and the stored
 * `urgency` only decides undated tasks (the ones a human really did triage).
 *
 * Overdue work resolves to "today" rather than falling off the board — a list
 * that hides a missed deadline cannot be trusted.
 *
 * Pure and timezone-explicit: callers pass the day key they consider "today"
 * (the client uses the viewer's own zone, matching the School tab's Runway).
 */

const WEEK_DAYS = 7;

/** `YYYY-MM-DD` for a Date in the runtime's local zone (browser = the operator's). */
export function localDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shift a `YYYY-MM-DD` key by whole days — pure calendar math. */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function effectiveLane(
  task: Pick<TaskDTO, "due_date" | "urgency">,
  today: string = localDayKey(),
): Urgency {
  if (!task.due_date) return task.urgency ?? "inbox";
  const due = task.due_date.slice(0, 10);
  if (due <= today) return "today";
  if (due <= addDays(today, WEEK_DAYS)) return "week";
  return "later";
}

/** True when a dated task is past its day — the caller may want to mark it. */
export function isOverdue(
  task: Pick<TaskDTO, "due_date">,
  today: string = localDayKey(),
): boolean {
  return !!task.due_date && task.due_date.slice(0, 10) < today;
}

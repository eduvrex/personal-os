/**
 * Lock-in mode: the end-of-semester front page. Client- and server-safe (no
 * secrets, no server-only imports). While `enabled` is true and today is on or
 * before `end`, `/` renders the Lock-in board instead of the Home dashboard
 * (which stays reachable at `/home`). Flip `enabled` off, or let `end` pass,
 * to get the normal Home back.
 *
 * PRIVACY: this file renders on screen. Keep grades, GPA and academic standing
 * out of it — that record is advisor-only (tests/unit/academicPrivacy.test.ts,
 * tests/unit/lockin.test.ts).
 */

export interface LockinKeyDate {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Local start time, HH:MM (24h), when the event is timed. */
  time?: string;
  label: string;
  course: string;
  /** Short note: weight, rules, room. */
  note?: string;
  /** Exams and finals render louder than ordinary deadlines. */
  major?: boolean;
}

export interface LockinCheck {
  id: string;
  label: string;
  detail?: string;
}

export const LOCKIN = {
  enabled: true,
  start: "2026-11-04",
  /** Last day of lock-in — the final exam. */
  end: "2026-12-09",
  title: "Lock-in",
} as const;

/**
 * The dates the whole run is built around. Kept in date order.
 * Demo values — replace with your own term's calendar.
 */
export const LOCKIN_KEY_DATES: LockinKeyDate[] = [
  { date: "2026-11-11", time: "11:15", label: "Midterm #3", course: "ECON 301", note: "In class · 15%", major: true },
  { date: "2026-11-11", time: "12:45", label: "Academic coaching", course: "Coaching", note: "Learning center · 12:45–1:30 PM" },
  { date: "2026-11-16", time: "10:30", label: "Advising appointment", course: "Advising", note: "10:30–11:00 · plan next term" },
  { date: "2026-11-21", label: "Fall break starts", course: "—", note: "Through Nov 29 — draft the final project" },
  { date: "2026-12-04", label: "Last day of classes", course: "—" },
  { date: "2026-12-07", time: "23:59", label: "Final project", course: "HIST 210", note: "25%", major: true },
  { date: "2026-12-08", time: "13:30", label: "Final exam", course: "ECON 301", note: "1:30–4:00 PM · 30%", major: true },
  { date: "2026-12-09", time: "19:30", label: "Exam 3", course: "STAT 250", note: "7:30–10:00 PM · no make-ups", major: true },
];

/** Ticked every day. A day counts toward the streak only when all are done. */
export const LOCKIN_DAILY: LockinCheck[] = [
  { id: "classes", label: "Every class attended", detail: "Attendance is graded in every course" },
  { id: "homework", label: "Online homework done the night before", detail: "Tick on days with none due" },
  { id: "due-today", label: "Everything due today submitted on time" },
  { id: "deep-block", label: "One 90-minute study block", detail: "Phone in another room" },
  { id: "plan-tomorrow", label: "Tomorrow checked tonight", detail: "Canvas + this page, 5 minutes" },
];

/** One-time actions that unblock the rest of the run. */
export const LOCKIN_UNBLOCK: LockinCheck[] = [
  { id: "advising", label: "Book the advising appointment", detail: "Before next term's registration opens" },
  { id: "office-hours", label: "Pick an office-hours slot for each course" },
  { id: "tuition", label: "Pay tuition" },
  { id: "study-group", label: "Set up a study group for the stats final" },
];

export const LOCKIN_RULES: string[] = [
  "Attend every class, every day. Nothing else on this page matters as much.",
  "Homework the night before — it closes in the morning and can't be made up.",
  "Submit on the due date, not inside the late window.",
  "One office-hours visit a week per hard class.",
  "Sunday reset, 20 minutes: Canvas grades, this page, move what's slipping to the top.",
];

export const LOCKIN_DAILY_IDS = LOCKIN_DAILY.map((c) => c.id);
export const LOCKIN_UNBLOCK_IDS = LOCKIN_UNBLOCK.map((c) => c.id);

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is past. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** True while lock-in should own the front page. */
export function isLockinActive(today: string): boolean {
  return LOCKIN.enabled && today >= LOCKIN.start && today <= LOCKIN.end;
}

/** Day N of the run (1-based) and the total length, for the hero counter. */
export function lockinDay(today: string): { day: number; total: number } {
  const total = daysBetween(LOCKIN.start, LOCKIN.end) + 1;
  const day = Math.min(total, Math.max(1, daysBetween(LOCKIN.start, today) + 1));
  return { day, total };
}

/** Key dates on or after today, soonest first. */
export function upcomingKeyDates(today: string, dates: LockinKeyDate[] = LOCKIN_KEY_DATES): LockinKeyDate[] {
  return dates.filter((d) => d.date >= today).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
}

/** The next exam or final — the countdown the hero leads with. */
export function nextMajor(today: string, dates: LockinKeyDate[] = LOCKIN_KEY_DATES): LockinKeyDate | null {
  return upcomingKeyDates(today, dates).find((d) => d.major) ?? null;
}

/** Pull the done-id list out of a stored `{ done: [...] }` blob, keeping only `allowed` ids. Pure. */
export function idsFrom(value: unknown, allowed: readonly string[]): string[] {
  const done = (value as { done?: unknown } | undefined)?.done;
  if (!Array.isArray(done)) return [];
  return [...new Set(done.filter((x): x is string => typeof x === "string" && allowed.includes(x)))];
}

/** Keep only known ids for a scope, de-duplicated. Pure. */
export function cleanIds(input: unknown, scope: "daily" | "unblock"): string[] {
  return idsFrom({ done: input }, scope === "daily" ? LOCKIN_DAILY_IDS : LOCKIN_UNBLOCK_IDS);
}

/** Days since lock-in started on which every daily check was ticked. Pure. */
export function fullDays(history: { date: string; done: string[] }[]): Set<string> {
  return new Set(
    history
      .filter((h) => h.date >= LOCKIN.start && LOCKIN_DAILY_IDS.every((id) => h.done.includes(id)))
      .map((h) => h.date),
  );
}

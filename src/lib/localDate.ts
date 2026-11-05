/**
 * Day-boundary helpers.
 *
 * The whole app decides "what day is it" in the operator's local timezone, not
 * the server's UTC clock. A capture made at 1am in Madrid belongs to that day,
 * not yesterday. Everywhere a "day" is chosen (daily logs, habit streaks,
 * "today's tasks") goes through here so the boundary is consistent.
 */

/** The operator's timezone. Falls back to Madrid if the env var is unset. */
export const USER_TIMEZONE = process.env.USER_TIMEZONE ?? "Europe/Madrid";

/**
 * Returns the calendar date in the operator's timezone as a `YYYY-MM-DD`
 * string — the canonical key for a `date` column (log_date, entry_date, …).
 *
 * @param date  Instant to convert. Defaults to now.
 */
export function localDateKey(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape Postgres `date`
  // columns expect.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Shift a `YYYY-MM-DD` key by whole days — pure calendar math, no timezone
 * involved. Used to convert between the inclusive end date a user picks and
 * the exclusive end FullCalendar stores for all-day events.
 */
export function shiftDateKey(key: string, days: number): string {
  const d = new Date(`${key.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Milliseconds the given timezone is ahead of UTC at the given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - at.getTime();
}

/**
 * Interpret a wall-clock date + time (`YYYY-MM-DD`, `HH:MM`) in the operator's
 * timezone and return the true UTC instant as an ISO string — the shape
 * `calendar_events.starts_at` stores. Handles DST via a second offset probe.
 */
export function localToUtcIso(dateKey: string, time: string): string {
  const naive = Date.parse(`${dateKey}T${time}:00Z`);
  const guess = naive - tzOffsetMs(USER_TIMEZONE, new Date(naive));
  const utc = naive - tzOffsetMs(USER_TIMEZONE, new Date(guess));
  return new Date(utc).toISOString();
}

/** The day before `key` (YYYY-MM-DD). Uses noon-UTC so DST never shifts it. */
export function prevDayKey(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * A GENTLE consecutive-day streak — self-compassion, not a scoreboard. Counts
 * back from today (or yesterday, if today isn't logged yet) while each prior day
 * is present. `days` is the set of YYYY-MM-DD keys with activity. Pure.
 */
export function consecutiveDayStreak(days: Set<string>, today: string = localDateKey()): number {
  let cursor = days.has(today) ? today : prevDayKey(today);
  if (!days.has(cursor)) return 0;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = prevDayKey(cursor);
  }
  return streak;
}

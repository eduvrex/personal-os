/**
 * Part-time job schedule — a fixed weekly config rather than DB data: the
 * hours are stable for the semester, so a code constant keeps the Home card
 * instant and dependency-free. Demo values; edit WORK_WEEK to match yours.
 *
 * - `mode` says where a shift happens; "varies" flips week to week.
 * - `note` is an optional one-liner shown under the shift.
 */
export type WorkMode = "remote" | "office" | "varies";

export interface WorkBlock {
  /** 0 = Monday … 4 = Friday. */
  day: number;
  /** "HH:MM" 24h wall-clock, matching rhythm block times. */
  start: string;
  end: string;
  mode: WorkMode;
  note?: string;
}

export const WORK_WEEK: WorkBlock[] = [
  { day: 0, start: "08:00", end: "09:00", mode: "remote" },
  { day: 0, start: "16:00", end: "17:00", mode: "office", note: "Team meeting — biweekly" },
  { day: 1, start: "11:00", end: "14:00", mode: "office", note: "Weekly check-in 13:00–14:00" },
  { day: 1, start: "15:00", end: "17:00", mode: "office" },
  { day: 2, start: "10:00", end: "11:00", mode: "remote" },
  { day: 3, start: "11:00", end: "14:00", mode: "varies" },
  { day: 3, start: "15:00", end: "17:00", mode: "varies" },
  { day: 4, start: "08:00", end: "09:00", mode: "remote" },
  { day: 4, start: "15:30", end: "16:30", mode: "remote" },
];

/** Work blocks for a JS Date (empty on weekends). */
export function workBlocksFor(date: Date): WorkBlock[] {
  const d = date.getDay(); // 0 Sun … 6 Sat
  if (d < 1 || d > 5) return [];
  return WORK_WEEK.filter((b) => b.day === d - 1);
}

/** "HH:MM" → minutes since midnight. */
export function toMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** Total hours across a set of blocks (e.g. one day, or the whole week). */
export function totalHours(blocks: WorkBlock[]): number {
  const mins = blocks.reduce((acc, b) => acc + toMinutes(b.end) - toMinutes(b.start), 0);
  return Math.round((mins / 60) * 10) / 10;
}

/** Human label for a block's location mode. */
export function modeLabel(mode: WorkMode): string {
  if (mode === "remote") return "Remote";
  if (mode === "office") return "In office";
  return "Office or remote";
}

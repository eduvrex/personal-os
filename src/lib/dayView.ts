/**
 * Day view — merges the editable Rhythm blocks with the fixed work
 * shifts (lib/workSchedule) into one ordered timeline per weekday, with an
 * end time for every item. Pure and client-safe (no server-only imports) so
 * the Rhythm "Week" panel and tests share it.
 *
 * End times: work shifts carry their own. A rhythm block uses the duration in
 * its label when it has one — "(65 min)", "(2h)", "(cap 60 min)" — otherwise
 * it runs until the next item starts, capped at DEFAULT_CAP_MIN so "Dinner"
 * doesn't swallow the evening. The last item of the day (Sleep) has no end.
 */
import type { RhythmBlockDTO } from "@/lib/types";
import { WORK_WEEK, modeLabel, toMinutes } from "@/lib/workSchedule";

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const DEFAULT_CAP_MIN = 90;

export interface DayItem {
  key: string;
  start: string; // "HH:MM"
  end: string | null; // "HH:MM" or null (open-ended)
  label: string;
  detail: string | null;
  kind: string; // rhythm kind, or "work"
}

export interface DaySummary {
  focusMin: number;
  classMin: number;
  workMin: number;
  leave: string | null;
  headHome: string | null;
}

/** "(65 min)" / "(2h)" / "(1.5 h)" / "(cap 60 min)" in a label → minutes. */
export function durationFromLabel(label: string): number | null {
  const min = /\((?:[^()]*?\s)?(\d+)\s*min\b[^()]*\)/i.exec(label);
  if (min) return Number(min[1]);
  const hr = /\((?:[^()]*?\s)?(\d+(?:\.\d+)?)\s*h\b[^()]*\)/i.exec(label);
  if (hr) return Math.round(Number(hr[1]) * 60);
  return null;
}

export function fromMinutes(total: number): string {
  const m = Math.max(0, Math.min(total, 24 * 60 - 1));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The ordered timeline for one weekday. */
export function buildDay(blocks: RhythmBlockDTO[], day: WeekdayKey): DayItem[] {
  const rhythm = blocks.filter(
    (b) => b.active && b.at_time && (b.days.length === 0 || b.days.includes(day)),
  );
  const dayIdx = WEEKDAY_KEYS.indexOf(day); // 0 = Monday, matches WorkBlock.day
  const work = WORK_WEEK.filter((w) => w.day === dayIdx);

  const items: (DayItem & { sort: number })[] = [
    ...rhythm.map((b) => ({
      key: b.id,
      start: b.at_time as string,
      end: null,
      label: b.label,
      detail: b.detail,
      kind: b.kind ?? "anchor",
      sort: b.sort,
    })),
    ...work.map((w, i) => ({
      key: `work-${dayIdx}-${i}`,
      start: w.start,
      end: w.end,
      label: `Work · ${modeLabel(w.mode)}`,
      detail: w.note ?? null,
      kind: "work",
      sort: 50,
    })),
  ];

  items.sort((a, b) => a.start.localeCompare(b.start) || a.sort - b.sort);

  return items.map((it, i) => {
    if (it.end) return stripSort(it);
    const startMin = toMinutes(it.start);
    const next = items.slice(i + 1).find((n) => n.start > it.start);
    const nextMin = next ? toMinutes(next.start) : null;
    const labelled = durationFromLabel(it.label);
    let endMin: number | null;
    if (labelled !== null) endMin = startMin + labelled;
    else if (nextMin !== null) endMin = Math.min(nextMin, startMin + DEFAULT_CAP_MIN);
    else endMin = null;
    return stripSort({ ...it, end: endMin === null ? null : fromMinutes(endMin) });
  });
}

function stripSort(it: DayItem & { sort: number }): DayItem {
  const { sort: _sort, ...rest } = it;
  void _sort;
  return rest;
}

function spanMin(it: DayItem): number {
  return it.end ? toMinutes(it.end) - toMinutes(it.start) : 0;
}

/** Totals + commute anchors for the day header. */
export function summarizeDay(items: DayItem[]): DaySummary {
  const sum = (pred: (i: DayItem) => boolean) =>
    items.filter(pred).reduce((acc, i) => acc + spanMin(i), 0);
  return {
    focusMin: sum((i) => i.kind === "focus" || i.kind === "akrov"),
    classMin: sum((i) => i.kind === "class"),
    workMin: sum((i) => i.kind === "work"),
    leave: items.find((i) => /^leave for campus/i.test(i.label))?.start ?? null,
    headHome: items.find((i) => /^head home/i.test(i.label))?.start ?? null,
  };
}

/** Index of the item happening at `nowHM` (last started, not yet ended), or -1. */
export function currentIndex(items: DayItem[], nowHM: string): number {
  let idx = -1;
  items.forEach((it, i) => {
    if (it.start <= nowHM && (it.end === null || nowHM < it.end)) idx = i;
  });
  return idx;
}

/** Index of the next item to start after `nowHM`, or -1. */
export function nextIndex(items: DayItem[], nowHM: string): number {
  return items.findIndex((it) => it.start > nowHM);
}

/** "Mon"-style key for a JS Date in the browser's local zone. */
export function weekdayKeyFor(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[(date.getDay() + 6) % 7];
}

/** 125 → "2h 5m". */
export function fmtMinutes(total: number): string {
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

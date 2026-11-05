import "server-only";

import { db, USER_ID, type RhythmBlockRow } from "@/lib/db";
import { USER_TIMEZONE } from "@/lib/localDate";
import { oneOf, optStr, reqStr, strArray } from "@/lib/validate";
import type { RhythmBlockDTO } from "@/lib/types";

/**
 * Daily Rhythm — a humane, fully editable routine. Sustainable, not militant:
 * the user sets their own times and blocks; these are only starting defaults.
 *
 * This is a NEUTRAL routine surface: blocks are plain labels the user set.
 * The rhythm feeds Home's "Today" card and the morning briefing.
 */

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The operator's local weekday as a lowercase 3-letter key ("mon"). */
export function localWeekday(date: Date = new Date()): string {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_TIMEZONE,
    weekday: "short",
  })
    .format(date)
    .slice(0, 3)
    .toLowerCase();
  return (WEEKDAYS as readonly string[]).includes(wd) ? wd : "mon";
}

function normDays(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const days = arr
    .map((d) => String(d).slice(0, 3).toLowerCase())
    .filter((d) => (WEEKDAYS as readonly string[]).includes(d));
  return [...new Set(days)];
}

function normTime(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const t = String(raw).trim();
  return TIME_RE.test(t) ? t : null;
}

function toDTO(r: RhythmBlockRow): RhythmBlockDTO {
  return {
    id: r.id,
    at_time: r.at_time,
    label: r.label,
    detail: r.detail,
    kind: r.kind,
    days: normDays(r.days),
    sort: r.sort,
    active: r.active,
  };
}

/**
 * Order blocks by time (untimed last), then explicit sort. Pure — exported so
 * both the surface and the tests share one ordering.
 */
export function orderBlocks(blocks: RhythmBlockDTO[]): RhythmBlockDTO[] {
  return [...blocks].sort((a, b) => {
    const at = a.at_time ?? "99:99";
    const bt = b.at_time ?? "99:99";
    return at.localeCompare(bt) || a.sort - b.sort || a.label.localeCompare(b.label);
  });
}

/** Blocks that apply on `weekday` ([] days = every day). Pure. */
export function blocksForWeekday(blocks: RhythmBlockDTO[], weekday: string): RhythmBlockDTO[] {
  return orderBlocks(
    blocks.filter((b) => b.active && (b.days.length === 0 || b.days.includes(weekday))),
  );
}

/** All blocks (active + paused), ordered. Resilient before the migration runs. */
export async function listRhythm(): Promise<RhythmBlockDTO[]> {
  try {
    const { data, error } = await db()
      .from("rhythm_blocks")
      .select("*")
      .eq("user_id", USER_ID);
    if (error) return [];
    return orderBlocks(((data ?? []) as RhythmBlockRow[]).map(toDTO));
  } catch {
    return [];
  }
}

/** Today's active blocks in the operator's timezone, ordered by time. */
export async function todayRhythm(): Promise<RhythmBlockDTO[]> {
  const all = await listRhythm();
  return blocksForWeekday(all, localWeekday());
}

/**
 * Neutral briefing lines for today's routine — "07:30 · Wake · breakfast",
 * etc. Echoes only the labels the user set. Never throws.
 */
export async function rhythmBriefingLines(): Promise<string[]> {
  try {
    const blocks = await todayRhythm();
    return blocks.map((b) => `${b.at_time ? `${b.at_time} · ` : ""}${b.label}`);
  } catch {
    return [];
  }
}

export interface BlockInput {
  at_time: string | null;
  label: string;
  detail: string | null;
  kind: string | null;
  days: string[];
}

export function parseBlockBody(body: Record<string, unknown>): BlockInput {
  return {
    label: reqStr(body.label, "label", 200),
    at_time: normTime(body.at_time),
    detail: optStr(body.detail, "detail", 2000),
    kind: oneOf(body.kind ?? null, "kind", KINDS, true),
    days: strArray(body.days, "days", 7, 3)
      .map((d) => d.slice(0, 3).toLowerCase())
      .filter((d) => (WEEKDAYS as readonly string[]).includes(d)),
  };
}

const KINDS = [
  "anchor",
  "focus",
  "akrov",
  "meal",
  "practice",
  "wind-down",
  "review",
  "class",
  "work",
  "training",
] as const;

export async function createBlock(input: BlockInput): Promise<RhythmBlockDTO> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("rhythm_blocks")
    .insert({
      user_id: USER_ID,
      at_time: input.at_time,
      label: input.label,
      detail: input.detail,
      kind: input.kind,
      days: input.days,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as RhythmBlockRow);
}

export async function updateBlock(
  id: string,
  patch: Partial<BlockInput> & { active?: boolean; sort?: number },
): Promise<RhythmBlockDTO | null> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.at_time !== undefined) upd.at_time = patch.at_time;
  if (patch.label !== undefined) upd.label = patch.label;
  if (patch.detail !== undefined) upd.detail = patch.detail;
  if (patch.kind !== undefined) upd.kind = patch.kind;
  if (patch.days !== undefined) upd.days = patch.days;
  if (patch.active !== undefined) upd.active = patch.active;
  if (patch.sort !== undefined) upd.sort = patch.sort;
  const { data, error } = await db()
    .from("rhythm_blocks")
    .update(upd)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data as RhythmBlockRow) : null;
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await db()
    .from("rhythm_blocks")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * A sustainable starting routine. Times are editable defaults; the protected
 * venture (Akrov) blocks live here too.
 */
export const DEFAULT_RHYTHM: Array<Omit<BlockInput, "days"> & { days?: string[] }> = [
  // Blocks with no `days` apply every day; the rest sit in gaps between classes.

  // ── Every day ──
  { at_time: "07:30", label: "Wake · breakfast", detail: "Ease in — no rush.", kind: "anchor" },
  { at_time: "07:45", label: "10-min meditation", detail: null, kind: "practice" },
  { at_time: "07:55", label: "2-min day plan", detail: "Pick today's top 3.", kind: "anchor" },

  // ── Morning focus window — one protected block every weekday ──
  { at_time: "08:05", label: "Deep work — GRE", detail: "80 min before the first class. Your best block of the week.", kind: "focus", days: ["tue", "thu"] },
  { at_time: "08:05", label: "Deep work — GRE", detail: "Short block before the 9:00 class.", kind: "focus", days: ["wed"] },
  { at_time: "09:55", label: "Deep work — GRE", detail: "80 min between morning classes.", kind: "focus", days: ["mon", "fri"] },

  // ── Meals ──
  { at_time: "12:05", label: "Lunch + short walk", detail: "Between midday classes.", kind: "meal", days: ["mon", "wed", "fri"] },
  { at_time: "14:00", label: "Lunch + short walk", detail: "Your only real break between work blocks — take it.", kind: "meal", days: ["tue", "thu"] },

  // ── Afternoon ──
  { at_time: "14:15", label: "Protected Akrov block", detail: "Two clear hours — the biggest window you own. Catch up with your co-founder.", kind: "akrov", days: ["wed"] },
  { at_time: "14:15", label: "Coursework block", detail: "Before the 15:35 recitation.", kind: "focus", days: ["mon"] },
  { at_time: "14:15", label: "Coursework block", detail: "Before the 15:30 work block.", kind: "focus", days: ["fri"] },
  { at_time: "16:30", label: "Protected Akrov block", detail: "Work ends at 16:30 — run straight into it.", kind: "akrov", days: ["fri"] },
  { at_time: "17:00", label: "Second focus block", detail: "Coursework or Akrov, whatever the week needs.", kind: "focus", days: ["mon", "tue", "thu"] },

  // ── Evening ──
  { at_time: "19:00", label: "Dinner", detail: null, kind: "meal" },
  { at_time: "21:00", label: "Wind-down · screens off", detail: null, kind: "wind-down" },
  { at_time: "21:30", label: "Reading — 20–30 min", detail: null, kind: "practice" },
  { at_time: "22:40", label: "Optional short meditation", detail: null, kind: "practice" },
  { at_time: "23:00", label: "Sleep", detail: null, kind: "anchor" },
  { at_time: "19:30", label: "Weekly review", detail: "Look back, plan the week.", kind: "review", days: ["sun"] },
];

/**
 * Seed the default rhythm — ONLY when the user has none yet, so it can safely be
 * offered as a "load a starting rhythm" button without ever clobbering edits.
 */
export async function seedDefaultRhythm(): Promise<RhythmBlockDTO[]> {
  const existing = await listRhythm();
  if (existing.length > 0) return existing;
  const now = new Date().toISOString();
  const rows = DEFAULT_RHYTHM.map((b, i) => ({
    user_id: USER_ID,
    at_time: b.at_time,
    label: b.label,
    detail: b.detail ?? null,
    kind: b.kind ?? null,
    days: b.days ?? [],
    sort: i,
    active: true,
    created_at: now,
    updated_at: now,
  }));
  const { error } = await db().from("rhythm_blocks").insert(rows);
  if (error) throw new Error(error.message);
  return listRhythm();
}

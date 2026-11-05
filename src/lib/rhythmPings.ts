import "server-only";

import { db, USER_ID } from "@/lib/db";
import {
  buildDay,
  currentIndex,
  nextIndex,
  WEEKDAY_KEYS,
  type DayItem,
  type WeekdayKey,
} from "@/lib/dayView";
import { localDateKey, shiftDateKey } from "@/lib/localDate";
import { friendlyHM, hmToMinutes, localTimeHM } from "@/lib/reminders";
import { listRhythm, localWeekday } from "@/lib/rhythm";
import { tgSendMessage, type TgInlineButton } from "@/lib/telegram";

/**
 * Rhythm pings → Telegram. On every scheduler tick (pg_cron hits
 * /api/cron/reminders every 5 minutes) this looks at TODAY's day-view
 * timeline (lib/dayView — rhythm blocks + work shifts) and sends:
 *
 *  - a "starting" nudge up to START_LEAD_MIN before a focus / Akrov / review
 *    block, or a "Leave for campus" / "Head home" block, with its note and
 *    what comes next;
 *  - a "how did it go?" check-in with ✅ / ½ / ❌ buttons right after a focus
 *    or Akrov block of CHECKIN_MIN_LENGTH+ minutes ends. The tap is recorded
 *    (recordCheckin) so the Rhythm page can show planned vs. done.
 *
 * Classes, meals and routine anchors are deliberately silent — pings only for
 * the blocks that slip. rhythm_pings' unique (day, block, kind) key makes the
 * whole thing idempotent: a missed or doubled tick never double-sends.
 */

export const START_LEAD_MIN = 5;
export const START_CATCHUP_MIN = 15;
export const CHECKIN_CATCHUP_MIN = 30;
export const CHECKIN_MIN_LENGTH = 30;

export type Outcome = "done" | "partial" | "skipped";
export const OUTCOMES: Outcome[] = ["done", "partial", "skipped"];

const COMMUTE_RE = /^(leave for campus|head home)/i;

/** Should this block get a "starting" nudge? Pure. */
export function wantsStartPing(it: DayItem): boolean {
  if (it.kind === "work") return false;
  return it.kind === "focus" || it.kind === "akrov" || it.kind === "review" || COMMUTE_RE.test(it.label);
}

/** Should this block get an end-of-block check-in? Pure. */
export function wantsCheckin(it: DayItem): boolean {
  if (!(it.kind === "focus" || it.kind === "akrov") || !it.end) return false;
  const start = hmToMinutes(it.start);
  const end = hmToMinutes(it.end);
  return start !== null && end !== null && end - start >= CHECKIN_MIN_LENGTH;
}

/** Minutes from `nowHM` until `hm` (negative = already passed). */
function minutesUntil(hm: string, nowHM: string): number {
  return (hmToMinutes(hm) ?? 0) - (hmToMinutes(nowHM) ?? 0);
}

export interface DuePing {
  item: DayItem;
  kind: "start" | "checkin";
}

/** Which pings are due at `nowHM` for a day's timeline. Pure — tested. */
export function duePings(items: DayItem[], nowHM: string): DuePing[] {
  const out: DuePing[] = [];
  for (const it of items) {
    if (it.key.startsWith("work-")) continue; // shifts aren't rhythm rows
    if (wantsStartPing(it)) {
      const d = minutesUntil(it.start, nowHM);
      if (d <= START_LEAD_MIN && d >= -START_CATCHUP_MIN) out.push({ item: it, kind: "start" });
    }
    if (wantsCheckin(it)) {
      const sinceEnd = -minutesUntil(it.end as string, nowHM);
      if (sinceEnd >= 0 && sinceEnd <= CHECKIN_CATCHUP_MIN) out.push({ item: it, kind: "checkin" });
    }
  }
  return out;
}

function range(it: DayItem): string {
  return it.end ? `${friendlyHM(it.start)}–${friendlyHM(it.end)}` : friendlyHM(it.start);
}

/** Text of a "starting" nudge. Pure. */
export function startText(it: DayItem, next: DayItem | null): string {
  const icon = COMMUTE_RE.test(it.label) ? "🚲" : it.kind === "review" ? "📋" : "▶️";
  const lines = [`${icon} ${range(it)} · ${it.label}`];
  if (it.detail) lines.push(it.detail);
  if (next) lines.push("", `Next: ${friendlyHM(next.start)} ${next.label}`);
  return lines.join("\n");
}

/** Text of an end-of-block check-in. Pure. */
export function checkinText(it: DayItem): string {
  return `⏱ How did it go?\n${range(it)} · ${it.label}`;
}

export function checkinButtons(pingId: string): TgInlineButton[][] {
  return [[
    { text: "✅ Done", callback_data: `rc:${pingId}:done` },
    { text: "½ Partly", callback_data: `rc:${pingId}:partial` },
    { text: "❌ Skipped", callback_data: `rc:${pingId}:skipped` },
  ]];
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  done: "✅ Done",
  partial: "½ Partly",
  skipped: "❌ Skipped",
};

/** The first item that starts after `it` (for "Next:"). */
function nextAfter(items: DayItem[], it: DayItem): DayItem | null {
  return items.find((n) => n.start > it.start && !n.key.startsWith("work-")) ??
    items.find((n) => n.start > it.start) ??
    null;
}

/** Today's timeline in the operator's timezone. */
export async function todayTimeline(now: Date = new Date()): Promise<{
  date: string;
  weekday: WeekdayKey;
  items: DayItem[];
}> {
  const wd = localWeekday(now);
  const weekday = ((WEEKDAY_KEYS as readonly string[]).includes(wd) ? wd : "mon") as WeekdayKey;
  const blocks = await listRhythm();
  return { date: localDateKey(now), weekday, items: buildDay(blocks, weekday) };
}

/** Send whatever nudges / check-ins are due now. Never double-sends. */
export async function runRhythmPings(now: Date = new Date()): Promise<{ due: number; sent: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;
  const { date, items } = await todayTimeline(now);
  const due = duePings(items, localTimeHM(now));

  let sent = 0;
  for (const { item, kind } of due) {
    // Claim first (unique key) — only the tick that inserts the row sends.
    const { data, error } = await db()
      .from("rhythm_pings")
      .upsert(
        {
          user_id: USER_ID,
          ping_date: date,
          block_id: item.key,
          kind,
          label: item.label,
          planned_start: item.start,
          planned_end: item.end,
        },
        { onConflict: "user_id,ping_date,block_id,kind", ignoreDuplicates: true },
      )
      .select("id");
    if (error || !data || data.length === 0) continue; // already sent
    if (!token || !chatId) continue;
    if (kind === "start") {
      await tgSendMessage(token, chatId, startText(item, nextAfter(items, item)));
    } else {
      await tgSendMessage(token, chatId, checkinText(item), checkinButtons(data[0].id as string));
    }
    sent++;
  }
  return { due: due.length, sent };
}

/** Record a ✅ / ½ / ❌ tap. Returns the block label, or null if unknown. */
export async function recordCheckin(pingId: string, outcome: Outcome): Promise<string | null> {
  const { data, error } = await db()
    .from("rhythm_pings")
    .update({ outcome, answered_at: new Date().toISOString() })
    .eq("user_id", USER_ID)
    .eq("id", pingId)
    .eq("kind", "checkin")
    .select("label,planned_start,planned_end");
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  return `${row.planned_start ?? ""}${row.planned_end ? `–${row.planned_end}` : ""} · ${row.label}`;
}

export interface CheckinStats {
  since: string;
  asked: number;
  done: number;
  partial: number;
  skipped: number;
  unanswered: number;
  /** block_id → outcome for today's answered check-ins. */
  today: Record<string, Outcome>;
}

/** Planned-vs-done since Monday of this week (operator's timezone). */
export async function checkinStats(now: Date = new Date()): Promise<CheckinStats> {
  const today = localDateKey(now);
  const wdIdx = (WEEKDAY_KEYS as readonly string[]).indexOf(localWeekday(now));
  const since = shiftDateKey(today, -Math.max(0, wdIdx));
  const empty: CheckinStats = { since, asked: 0, done: 0, partial: 0, skipped: 0, unanswered: 0, today: {} };
  try {
    const { data, error } = await db()
      .from("rhythm_pings")
      .select("block_id,ping_date,outcome")
      .eq("user_id", USER_ID)
      .eq("kind", "checkin")
      .gte("ping_date", since);
    if (error) return empty;
    const rows = (data ?? []) as { block_id: string; ping_date: string; outcome: Outcome | null }[];
    const stats = { ...empty, asked: rows.length };
    for (const r of rows) {
      if (r.outcome) stats[r.outcome]++;
      else stats.unanswered++;
      if (r.ping_date === today && r.outcome) stats.today[r.block_id] = r.outcome;
    }
    return stats;
  } catch {
    return empty;
  }
}

/** "/now" reply: what's happening and what's next, today. */
export async function composeNow(now: Date = new Date()): Promise<string> {
  const { items } = await todayTimeline(now);
  if (items.length === 0) return "Nothing planned today.";
  const hm = localTimeHM(now);
  const cur = items[currentIndex(items, hm)];
  const nxt = items[nextIndex(items, hm)];
  const lines: string[] = [];
  if (cur) {
    lines.push(`Now: ${range(cur)} · ${cur.label}`);
    if (cur.detail) lines.push(cur.detail);
  } else {
    lines.push("Now: free time.");
  }
  if (nxt) {
    const mins = minutesUntil(nxt.start, hm);
    lines.push("", `Next in ${mins} min: ${friendlyHM(nxt.start)} ${nxt.label}`);
    if (nxt.detail) lines.push(nxt.detail);
  }
  return lines.join("\n");
}

import "server-only";

import { db, USER_ID } from "@/lib/db";
import { localDateKey, USER_TIMEZONE } from "@/lib/localDate";
import { tgSendMessage } from "@/lib/telegram";

/**
 * Timed task reminders → Telegram. A scheduler (Supabase pg_cron hitting
 * /api/cron/reminders every 5 minutes) calls runReminders(); any open task due
 * TODAY with a due_time inside the send window gets exactly one Telegram ping,
 * stamped via tasks.reminded_at (migration 0011) so retries never double-send.
 *
 * Window semantics: send when the due time is at most LEAD_MIN in the future
 * (a 5-minute heads-up beats a late ping) and at most CATCHUP_MIN in the past
 * (covers a missed scheduler tick without replaying the whole morning).
 */

export const LEAD_MIN = 5;
export const CATCHUP_MIN = 45;

/** "HH:MM" (24h) in the user's timezone. */
export function localTimeHM(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: USER_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Minutes since local midnight for an "HH:MM[:SS]" value, or null. */
export function hmToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(minutes) ? minutes : null;
}

/** Pure window check — exported for tests. */
export function inReminderWindow(
  dueHM: string | null | undefined,
  nowHM: string,
  leadMin: number = LEAD_MIN,
  catchupMin: number = CATCHUP_MIN,
): boolean {
  const due = hmToMinutes(dueHM);
  const now = hmToMinutes(nowHM);
  if (due === null || now === null) return false;
  const delta = due - now; // positive = still in the future
  return delta <= leadMin && delta >= -catchupMin;
}

/** "17:00" → "5:00pm" for the message text. */
export function friendlyHM(hm: string): string {
  const minutes = hmToMinutes(hm);
  if (minutes === null) return hm;
  const h24 = Math.floor(minutes / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(minutes % 60).padStart(2, "0")}${h24 < 12 ? "am" : "pm"}`;
}

export function reminderText(title: string, dueHM: string): string {
  return `⏰ Reminder: ${title} — ${friendlyHM(dueHM)} today`;
}

const MAX_PER_RUN = 10;

interface ReminderRow {
  id: string;
  title: string;
  due_time: string | null;
}

/**
 * Send due reminders once. Stamps reminded_at BEFORE sending so a crashed run
 * can at worst drop one ping, never spam repeats of it.
 */
export async function runReminders(now: Date = new Date()): Promise<{
  checked: number;
  sent: number;
}> {
  const today = localDateKey(now);
  const nowHM = localTimeHM(now);

  const { data, error } = await db()
    .from("tasks")
    .select("id,title,due_time")
    .eq("user_id", USER_ID)
    // Open = not completed; the schema stores completion as a timestamp.
    .is("completed_at", null)
    .eq("due_date", today)
    .not("due_time", "is", null)
    .is("reminded_at", null);
  if (error) throw new Error(error.message);

  const due = ((data ?? []) as ReminderRow[])
    .filter((t) => inReminderWindow(t.due_time, nowHM))
    .slice(0, MAX_PER_RUN);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_USER_ID;

  let sent = 0;
  for (const task of due) {
    const { error: stampError } = await db()
      .from("tasks")
      .update({ reminded_at: now.toISOString() })
      .eq("user_id", USER_ID)
      .eq("id", task.id)
      .is("reminded_at", null);
    if (stampError) continue; // another tick claimed it
    if (token && chatId) {
      await tgSendMessage(token, chatId, reminderText(task.title, (task.due_time ?? "").slice(0, 5)));
      sent++;
    }
  }
  return { checked: (data ?? []).length, sent };
}

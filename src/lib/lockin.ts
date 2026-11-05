import "server-only";

import { getDayNotes, mergeDayNotes, recentDayNotes } from "@/lib/dayLog";
import { GOALS_SENTINEL_DATE } from "@/lib/goals";
import { consecutiveDayStreak, localDateKey } from "@/lib/localDate";
import {
  LOCKIN,
  LOCKIN_DAILY_IDS,
  LOCKIN_UNBLOCK_IDS,
  cleanIds,
  fullDays,
  idsFrom,
} from "@/lib/config/lockin";
import type { LockinStateDTO } from "@/lib/types";

/**
 * Lock-in state lives in the shared daily_logs notes blob (lib/dayLog.ts):
 *  - the daily non-negotiables under `lockin` on each real day;
 *  - the one-time unblockers under `lockin_unblock` on the goals sentinel day,
 *    so they never roll over.
 * Only ids from config/lockin.ts are ever stored.
 */

const DAILY_KEY = "lockin";
const UNBLOCK_KEY = "lockin_unblock";

export async function getLockinState(today: string = localDateKey()): Promise<LockinStateDTO> {
  const [recent, sentinel, todayNotes] = await Promise.all([
    recentDayNotes(60),
    getDayNotes(GOALS_SENTINEL_DATE),
    getDayNotes(today),
  ]);
  const history = recent
    .filter((r) => r.date >= LOCKIN.start && r.date <= today && r.date !== GOALS_SENTINEL_DATE)
    .map((r) => ({ date: r.date, done: idsFrom(r.notes[DAILY_KEY], LOCKIN_DAILY_IDS) }));
  const todayDone = idsFrom(todayNotes[DAILY_KEY], LOCKIN_DAILY_IDS);
  if (!history.some((h) => h.date === today)) history.unshift({ date: today, done: todayDone });

  return {
    today,
    daily: todayDone,
    unblock: idsFrom(sentinel[UNBLOCK_KEY], LOCKIN_UNBLOCK_IDS),
    streak: consecutiveDayStreak(fullDays(history), today),
    history,
  };
}

export async function setDaily(date: string, done: string[]): Promise<void> {
  await mergeDayNotes(date, { [DAILY_KEY]: { done: cleanIds(done, "daily") } });
}

export async function setUnblock(done: string[]): Promise<void> {
  await mergeDayNotes(GOALS_SENTINEL_DATE, { [UNBLOCK_KEY]: { done: cleanIds(done, "unblock") } });
}

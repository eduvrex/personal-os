import "server-only";

import { db, USER_ID } from "@/lib/db";

/**
 * daily_logs holds one row per (user, local day). Its `notes` text column
 * stores a JSON blob so several day-scoped features (habits, today's intention,
 * …) can share the row without schema changes. This module is the single place
 * that reads and merges that blob so the features don't clobber each other.
 *
 * Goals deliberately do NOT live on a real day — they're stored on a sentinel
 * date (see lib/goals.ts) so they never roll over.
 */

export type DayNotes = Record<string, unknown>;

function parseNotes(notes: unknown): DayNotes {
  if (!notes) return {};
  if (typeof notes === "string") {
    try {
      const parsed = JSON.parse(notes);
      return parsed && typeof parsed === "object" ? (parsed as DayNotes) : {};
    } catch {
      return {};
    }
  }
  if (typeof notes === "object") return notes as DayNotes;
  return {};
}

/** Read the merged notes blob for a given date key (YYYY-MM-DD). */
export async function getDayNotes(date: string): Promise<DayNotes> {
  const { data, error } = await db()
    .from("daily_logs")
    .select("notes")
    .eq("user_id", USER_ID)
    .eq("log_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseNotes(data?.notes);
}

/**
 * Shallow-merge `patch` into the day's notes blob, creating the row if needed,
 * and return the merged result.
 */
export async function mergeDayNotes(
  date: string,
  patch: DayNotes,
): Promise<DayNotes> {
  const current = await getDayNotes(date);
  const next = { ...current, ...patch };
  const serialized = JSON.stringify(next);
  const now = new Date().toISOString();

  const existing = await db()
    .from("daily_logs")
    .select("id")
    .eq("user_id", USER_ID)
    .eq("log_date", date)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  if (existing.data) {
    const { error } = await db()
      .from("daily_logs")
      .update({ notes: serialized, updated_at: now })
      .eq("id", existing.data.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await db().from("daily_logs").insert({
      user_id: USER_ID,
      log_date: date,
      notes: serialized,
      created_at: now,
      updated_at: now,
    });
    if (error) throw new Error(error.message);
  }
  return next;
}

/** Fetch notes blobs for the last `days` days (most recent first). */
export async function recentDayNotes(
  days: number,
): Promise<{ date: string; notes: DayNotes }[]> {
  const { data, error } = await db()
    .from("daily_logs")
    .select("log_date,notes")
    .eq("user_id", USER_ID)
    .order("log_date", { ascending: false })
    .limit(days);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    date: r.log_date as string,
    notes: parseNotes(r.notes),
  }));
}

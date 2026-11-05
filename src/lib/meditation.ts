import "server-only";

import { db, USER_ID, type MeditationSessionRow } from "@/lib/db";
import { consecutiveDayStreak, localDateKey } from "@/lib/localDate";
import { optStr, ValidationError } from "@/lib/validate";
import type { MeditationSessionDTO, MeditationStatsDTO } from "@/lib/types";

/**
 * Meditation tracker: a simple
 * timer + session log + a gentle streak. No advice, no health context.
 */

function toDTO(r: MeditationSessionRow): MeditationSessionDTO {
  return {
    id: r.id,
    session_date: r.session_date,
    duration_sec: Number(r.duration_sec ?? 0),
    note: r.note,
  };
}

/** Sessions + derived stats. Resilient: empty before the migration runs. */
export async function meditationStats(): Promise<MeditationStatsDTO> {
  const empty: MeditationStatsDTO = {
    streak: 0,
    sessionsThisWeek: 0,
    totalMinutes: 0,
    today: false,
    recent: [],
  };
  try {
    const { data, error } = await db()
      .from("meditation_sessions")
      .select("id,session_date,duration_sec,note")
      .eq("user_id", USER_ID)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(400);
    if (error) return empty;
    const rows = ((data ?? []) as MeditationSessionRow[]).map(toDTO);
    const today = localDateKey();
    const days = new Set(rows.map((r) => r.session_date));
    const weekAgo = new Date(Date.now() - 6 * 86_400_000);
    const weekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => localDateKey(new Date(weekAgo.getTime() + i * 86_400_000))),
    );
    return {
      streak: consecutiveDayStreak(days, today),
      sessionsThisWeek: rows.filter((r) => weekKeys.has(r.session_date)).length,
      totalMinutes: Math.round(rows.reduce((s, r) => s + r.duration_sec, 0) / 60),
      today: days.has(today),
      recent: rows.slice(0, 10),
    };
  } catch {
    return empty;
  }
}

/** Log a completed session (seconds meditated). */
export async function logMeditation(durationSec: number, note?: string | null): Promise<void> {
  const secs = Math.max(0, Math.min(24 * 3600, Math.round(Number(durationSec) || 0)));
  const cleanNote = optStr(note, "note", 1000);
  const { error } = await db().from("meditation_sessions").insert({
    user_id: USER_ID,
    session_date: localDateKey(),
    duration_sec: secs,
    note: cleanNote,
  });
  if (error) throw new Error(error.message);
}

export function parseMeditationBody(body: Record<string, unknown>): {
  duration_sec: number;
  note: string | null;
} {
  const raw = Number(body.duration_sec);
  if (!Number.isFinite(raw) || raw < 0) {
    throw new ValidationError("duration_sec must be a non-negative number.");
  }
  return { duration_sec: raw, note: optStr(body.note, "note", 1000) };
}

export async function deleteMeditation(id: string): Promise<void> {
  const { error } = await db()
    .from("meditation_sessions")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

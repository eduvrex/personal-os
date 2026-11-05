import { NextResponse, type NextRequest } from "next/server";

import { getDayNotes, recentDayNotes, type DayNotes } from "@/lib/dayLog";
import { localDateKey } from "@/lib/localDate";
import { HABITS } from "@/lib/config/habits";
import type { HabitStateDTO } from "@/lib/types";

const TOTAL = HABITS.length;

/** Pull the habit state out of a day's notes blob, defaulting empty. */
function stateFromNotes(date: string, notes: DayNotes): HabitStateDTO {
  const habits = (notes.habits ?? {}) as { done?: unknown };
  const done = Array.isArray(habits.done)
    ? (habits.done as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  return { date, done, total: TOTAL };
}

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

  try {
    const today = localDateKey();
    const recent = await recentDayNotes(days);
    const history = recent.map((r) => stateFromNotes(r.date, r.notes));

    // Ensure today's state is always present, even with no row yet.
    let todayState = history.find((h) => h.date === today);
    if (!todayState) {
      todayState = stateFromNotes(today, await getDayNotes(today));
    }

    return NextResponse.json({ today: todayState, days: history });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { mergeDayNotes } from "@/lib/dayLog";
import { HABIT_IDS, HABITS } from "@/lib/config/habits";
import type { HabitStateDTO } from "@/lib/types";

type Params = { params: Promise<{ date: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Set the full list of completed habits for a given local day. */
export async function POST(request: NextRequest, { params }: Params) {
  const { date } = await params;
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body?.done)) {
    return NextResponse.json(
      { error: "Body must include a `done` array of habit ids." },
      { status: 400 },
    );
  }

  // Keep only known habit ids, de-duplicated.
  const done = [
    ...new Set(
      (body.done as unknown[]).filter(
        (x): x is string => typeof x === "string" && HABIT_IDS.includes(x),
      ),
    ),
  ];
  const total = HABITS.length;

  try {
    await mergeDayNotes(date, { habits: { done, total } });
    const state: HabitStateDTO = { date, done, total };
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

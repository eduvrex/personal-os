import { NextResponse } from "next/server";

import { todayRhythm } from "@/lib/rhythm";

/** Today's active rhythm blocks in the operator's timezone (Home "Today" card). */
export async function GET() {
  try {
    return NextResponse.json(await todayRhythm());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

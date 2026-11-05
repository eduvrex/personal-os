import { NextResponse, type NextRequest } from "next/server";

import { getDayNotes, mergeDayNotes } from "@/lib/dayLog";
import { localDateKey } from "@/lib/localDate";

/** Today's intention lives in the day-log notes blob under `intention`. */
export async function GET() {
  try {
    const notes = await getDayNotes(localDateKey());
    const intention = typeof notes.intention === "string" ? notes.intention : "";
    return NextResponse.json({ intention });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const intention = String(body?.intention ?? "").trim().slice(0, 1000);
  try {
    await mergeDayNotes(localDateKey(), { intention });
    return NextResponse.json({ intention });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { sendBriefing } from "@/lib/briefing";

export const maxDuration = 60;

export async function GET() {
  try {
    const text = await sendBriefing();
    return NextResponse.json({ ok: true, text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

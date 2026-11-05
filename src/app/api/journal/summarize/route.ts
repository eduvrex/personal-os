import { NextResponse } from "next/server";

import { rateLimit, tooMany } from "@/lib/rateLimit";
import { summarizeDay } from "@/lib/summary";

export async function POST() {
  const limit = rateLimit("journal-summarize", 6, 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }
  try {
    const summary = await summarizeDay();
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

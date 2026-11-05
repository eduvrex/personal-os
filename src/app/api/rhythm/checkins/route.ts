import { NextResponse } from "next/server";

import { checkinStats } from "@/lib/rhythmPings";

/** This week's planned-vs-done check-in tally + today's answered blocks. */
export async function GET() {
  try {
    return NextResponse.json(await checkinStats());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

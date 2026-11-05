import { NextResponse } from "next/server";

import { seedDefaultRhythm } from "@/lib/rhythm";

/** Load a sustainable starting routine — no-op if any blocks already exist. */
export async function POST() {
  try {
    return NextResponse.json(await seedDefaultRhythm());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";

import { runCanvasSync } from "@/lib/canvas";

export const maxDuration = 120;

export async function POST() {
  try {
    return NextResponse.json(await runCanvasSync());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

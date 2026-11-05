import { NextResponse } from "next/server";

import { getCanvasData } from "@/lib/canvas";

export async function GET() {
  try {
    return NextResponse.json(await getCanvasData());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

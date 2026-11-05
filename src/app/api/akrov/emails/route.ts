import { NextResponse } from "next/server";

import { listEmailItems } from "@/lib/akrov";

/** Session-authed: unhandled Akrov email items for the Akrov tab. */
export async function GET() {
  try {
    return NextResponse.json(await listEmailItems());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

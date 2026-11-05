import { NextResponse, type NextRequest } from "next/server";
import { buildCalendar } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  try {
    return NextResponse.json(
      await buildCalendar(sp.get("from") ?? undefined, sp.get("to") ?? undefined),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

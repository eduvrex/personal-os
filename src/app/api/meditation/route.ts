import { NextResponse, type NextRequest } from "next/server";

import { logMeditation, meditationStats, parseMeditationBody } from "@/lib/meditation";
import { asObject, ValidationError } from "@/lib/validate";

export async function GET() {
  try {
    return NextResponse.json(await meditationStats());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let parsed: { duration_sec: number; note: string | null };
  try {
    parsed = parseMeditationBody(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    await logMeditation(parsed.duration_sec, parsed.note);
    return NextResponse.json(await meditationStats(), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

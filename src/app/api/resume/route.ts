import { NextResponse, type NextRequest } from "next/server";

import { getResume, updateResume } from "@/lib/resume";

export async function GET() {
  try {
    return NextResponse.json(await getResume());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (typeof body?.full_text !== "string") {
    return NextResponse.json({ error: "full_text is required." }, { status: 400 });
  }
  if (body.full_text.length > 100_000) {
    return NextResponse.json({ error: "CV text is capped at 100k characters." }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateResume(body.full_text));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

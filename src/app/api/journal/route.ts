import { NextResponse, type NextRequest } from "next/server";

import { addJournal, listJournal } from "@/lib/journal";

export async function GET(request: NextRequest) {
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;
  try {
    return NextResponse.json(await listJournal(days));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }
  if (text.length > 20_000) {
    return NextResponse.json({ error: "Entries are capped at 20k characters." }, { status: 400 });
  }
  try {
    const entry = await addJournal({
      text,
      mood: typeof body?.mood === "string" ? body.mood.slice(0, 16) : null,
      source: typeof body?.source === "string" ? body.source.slice(0, 32) : "text",
      private: body?.private === true,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

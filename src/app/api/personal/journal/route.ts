import { NextResponse, type NextRequest } from "next/server";

import { addJournal, listPersonal } from "@/lib/journal";

export async function GET() {
  try {
    return NextResponse.json(await listPersonal(120));
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
      source: "personal",
      personal: true,
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

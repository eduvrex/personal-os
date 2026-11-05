import { NextResponse, type NextRequest } from "next/server";

import { isUuid } from "@/lib/validate";

import { setJournalPrivate } from "@/lib/journal";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (typeof body?.private !== "boolean") {
    return NextResponse.json({ error: "private (boolean) is required." }, { status: 400 });
  }
  try {
    await setJournalPrivate(id, body.private);
    return NextResponse.json({ ok: true, private: body.private });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

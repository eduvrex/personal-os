import { NextResponse, type NextRequest } from "next/server";

import { runCapture } from "@/lib/capture";
import { rateLimit, tooMany } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Captures are capped at 4000 characters." }, { status: 400 });
  }
  const limit = rateLimit("capture", 20, 60_000);
  if (!limit.ok) {
    const { body: b, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(b, init);
  }
  try {
    const result = await runCapture({ text, source: "web" });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

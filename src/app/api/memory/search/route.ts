import { NextResponse, type NextRequest } from "next/server";

import { searchMemory } from "@/lib/memory";
import { rateLimit, tooMany } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const rl = rateLimit("memory-search", 30, 60_000);
  if (!rl.ok) {
    const { body: b, init } = tooMany(rl.retryAfterSec);
    return NextResponse.json(b, init);
  }
  const body = await request.json().catch(() => ({}));
  const query = String(body?.query ?? "").trim().slice(0, 500);
  if (!query) return NextResponse.json({ results: [] });

  const raw = typeof body?.limit === "number" ? body.limit : 8;
  const limit = Math.min(25, Math.max(1, Math.floor(raw) || 8));
  try {
    const results = await searchMemory(query, limit);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

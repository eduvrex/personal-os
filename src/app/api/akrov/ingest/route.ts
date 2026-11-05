import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/auth/session";
import { ingestEmailItems, parseIngestBody } from "@/lib/akrov";
import { ValidationError } from "@/lib/validate";

/** True when the request carries the Akrov email forwarder's ingest bearer. */
function isIngest(request: NextRequest): boolean {
  const secret = process.env.AKROV_INGEST_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && safeEqual(auth, `Bearer ${secret}`);
}

/**
 * Inbound feed from the Akrov Gmail account (Apps Script forwarder, POST-only,
 * allowed through the middleware for exactly this path). Idempotent by Gmail
 * message id — a re-sent batch inserts nothing new.
 */
export async function POST(request: NextRequest) {
  if (!isIngest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const items = parseIngestBody(await request.json().catch(() => null));
    const result = await ingestEmailItems(items);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

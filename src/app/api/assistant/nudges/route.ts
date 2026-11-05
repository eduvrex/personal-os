import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/auth/session";
import { generateNudges, listNudges } from "@/lib/nudges";
import { rateLimit, tooMany } from "@/lib/rateLimit";

export const maxDuration = 120;

function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  return !!secret && !!auth && safeEqual(auth, `Bearer ${secret}`);
}

/**
 * GET reads stored nudges from the DB — NO AI, safe on page load.
 * EXCEPT when called by Vercel Cron (Bearer CRON_SECRET): then it regenerates,
 * since Vercel Cron can only issue GET requests.
 */
export async function GET(request: NextRequest) {
  try {
    if (isCron(request)) {
      const result = await generateNudges();
      return NextResponse.json({ ok: true, cron: true, ...result });
    }
    return NextResponse.json(await listNudges());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

// POST regenerates via Claude — COST: only the manual refresh button (or cron)
// should call this. Never on page load.
export async function POST() {
  const limit = rateLimit("nudges", 3, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }
  try {
    const result = await generateNudges();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Graceful fallback: previous nudges are left intact.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

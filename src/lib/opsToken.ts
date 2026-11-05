import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Scoped capability token for the self-authenticated GET endpoints (the
 * external check-in, the capture audit, and manual reminder ticks). Derived
 * from AUTH_SECRET with a fixed scope string, so:
 *   - no new env var to manage anywhere,
 *   - it is never the master secret (knowing it does not unlock the app),
 *   - anything holding .env.local can recompute it offline:
 *     printf 'personal-os:ops:v1' | openssl dgst -sha256 -hmac "$AUTH_SECRET" -r
 *
 * These endpoints exist because Claude's sandbox can only reach the app via a
 * plain GET fetch (no custom headers) — same capability-URL posture as
 * GOOGLE_CALENDAR_ICAL_URL, but scoped and constant-time compared. The token
 * does appear in request logs; it grants exactly these ops and nothing else.
 */

const SCOPE = "personal-os:ops:v1";

export function opsToken(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret).update(SCOPE).digest("hex");
}

/** Constant-time check of a `?key=` value. Fail-closed when AUTH_SECRET is unset. */
export function verifyOpsKey(key: string | null | undefined): boolean {
  const expected = opsToken();
  if (!expected || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Response helper for the ops endpoints: with `?fmt=text` the JSON is served
 * as text/plain, because Claude's web_fetch renders application/json bodies
 * as empty and text is all a header-less GET caller can reliably read.
 */
export function opsResponse(
  data: unknown,
  fmt: string | null | undefined,
  status = 200,
): NextResponse {
  if (fmt === "text") {
    return new NextResponse(JSON.stringify(data, null, 1), {
      status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.json(data, { status });
}

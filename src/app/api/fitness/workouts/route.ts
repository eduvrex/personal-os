import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/auth/session";
import {
  addWorkout,
  ingestWorkouts,
  listWorkouts,
  parseIngestBody,
  parseManualBody,
} from "@/lib/fitness";
import { ValidationError } from "@/lib/validate";

/** True when the request carries the external lifting app's ingest bearer. */
function isIngest(request: NextRequest): boolean {
  const secret = process.env.FITNESS_INGEST_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && safeEqual(auth, `Bearer ${secret}`);
}

/** Session-authed list for the Fitness tab (newest first). */
export async function GET() {
  try {
    return NextResponse.json(await listWorkouts());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

/**
 * Two callers share this POST:
 *  - the external lifting app with `Authorization: Bearer FITNESS_INGEST_SECRET`
 *    (allowed through the middleware) → idempotent upsert by external_id;
 *  - the Fitness tab with the session cookie → plain manual insert.
 */
export async function POST(request: NextRequest) {
  const ingest = isIngest(request);
  const raw = await request.json().catch(() => null);

  try {
    if (ingest) {
      const items = parseIngestBody(raw);
      const result = await ingestWorkouts(items);
      return NextResponse.json({ ok: true, ...result });
    }
    const workout = await addWorkout(parseManualBody(raw));
    return NextResponse.json(workout, { status: 201 });
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

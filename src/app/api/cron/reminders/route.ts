import { type NextRequest } from "next/server";

import { safeEqual } from "@/lib/auth/session";
import { opsResponse, verifyOpsKey } from "@/lib/opsToken";
import { runReminders } from "@/lib/reminders";
import { runRhythmPings } from "@/lib/rhythmPings";

export const maxDuration = 60;

/**
 * Reminder tick — meant to be hit every 5 minutes by Supabase pg_cron
 * (see supabase/OPS_pg_cron_reminders.sql; Vercel hobby crons are daily-only,
 * so the DB is the scheduler). Middleware lets this GET through; the route
 * fail-closes on its own two accepted credentials:
 *   - `Authorization: Bearer CRON_SECRET`  (pg_net / any external pinger)
 *   - `?key=<ops token>`                    (manual tick from Claude/web_fetch)
 */
function isCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  return !!secret && !!auth && safeEqual(auth, `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fmt = params.get("fmt");
  if (!isCron(request) && !verifyOpsKey(params.get("key"))) {
    return opsResponse({ error: "Unauthorized." }, fmt, 401);
  }
  try {
    const result = await runReminders();
    // Rhythm nudges + check-ins ride the same 5-minute tick; a failure there
    // must never block task reminders (and vice versa).
    const rhythm = await runRhythmPings().catch((e: unknown) => ({
      error: e instanceof Error ? e.message : "rhythm pings failed",
    }));
    return opsResponse({ ok: true, ...result, rhythm }, fmt);
  } catch (e) {
    return opsResponse(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      fmt,
      500,
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { getLockinState, setDaily, setUnblock } from "@/lib/lockin";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Unexpected error.";
}

/** Today's lock-in ticks, the unblockers, the full-day streak and history. */
export async function GET() {
  try {
    return NextResponse.json(await getLockinState());
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/**
 * Set the full done-list for one scope.
 * Body: { scope: "daily", date: "YYYY-MM-DD", done: string[] }
 *    or { scope: "unblock", done: string[] }
 * Unknown ids are dropped (config/lockin.ts is the allowlist).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body?.done)) {
    return NextResponse.json({ error: "Body must include a `done` array." }, { status: 400 });
  }
  try {
    if (body.scope === "daily") {
      if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
        return NextResponse.json({ error: "Daily ticks need a YYYY-MM-DD `date`." }, { status: 400 });
      }
      await setDaily(body.date, body.done);
    } else if (body.scope === "unblock") {
      await setUnblock(body.done);
    } else {
      return NextResponse.json({ error: "`scope` must be daily or unblock." }, { status: 400 });
    }
    return NextResponse.json(await getLockinState());
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

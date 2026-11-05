import { NextResponse } from "next/server";

import { runSync } from "@/lib/financeSync";

// Allow the long-running sync to use the full function duration.
export const maxDuration = 300;

async function handle() {
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg =
      e && typeof e === "object" && "response" in e
        ? ((e as { response?: { data?: { error_message?: string } } }).response?.data
            ?.error_message ?? "Plaid sync failed.")
        : e instanceof Error
          ? e.message
          : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET is used by Vercel Cron (it issues GET requests); POST by the manual
// "Sync now" button. Auth is handled in middleware (session, x-api-secret, or
// the cron Bearer token).
export async function GET() {
  return handle();
}

export async function POST() {
  return handle();
}

import { NextResponse } from "next/server";

import { runCanvasSync } from "@/lib/canvas";
import { runSync } from "@/lib/financeSync";
import { generateNudges, nudgesFreshWithinHours } from "@/lib/nudges";
import { triageJobEmails } from "@/lib/jobEmails";
import { runBackup } from "@/lib/backup";
import { sendBriefing } from "@/lib/briefing";

// Consolidated daily automation (one cron on the hobby plan). Runs at the hour
// set in vercel.json. Each step is best-effort so a failure doesn't block the
// rest; the briefing runs last so it reflects fresh data.
export const maxDuration = 300;

const msg = (e: unknown) => (e instanceof Error ? e.message : "error");

async function run() {
  const out: Record<string, unknown> = {};
  try {
    const sync = await runSync();
    out.sync = sync;
    // runSync isolates per-item failures instead of throwing — still surface
    // them so the cron run shows red and the message names the bank.
    const failed = Object.entries(sync.errors ?? {});
    if (failed.length) out.syncError = failed.map(([k, v]) => `${k}: ${v}`).join("; ");
  } catch (e) { out.syncError = msg(e); }
  try { out.canvas = await runCanvasSync(); } catch (e) { out.canvasError = msg(e); }
  try {
    // If the scheduled Claude check-in (subscription-billed, runs before this
    // cron) already refreshed the nudges this morning, skip the paid API
    // regeneration — the briefing below still uses the fresh set. The API
    // path remains the automatic fallback whenever that task misses a day.
    out.nudges = (await nudgesFreshWithinHours(20))
      ? { skipped: "fresh from external check-in" }
      : await generateNudges();
  } catch (e) { out.nudgesError = msg(e); }
  try {
    // Job-search inbox: retroactively match new applications, drop board
    // marketing, and move an application to decision/interview when a reply
    // says so. Runs before the briefing so the brief reflects it.
    out.jobEmails = await triageJobEmails();
  } catch (e) { out.jobEmailsError = msg(e); }
  try { out.backup = await runBackup(); } catch (e) { out.backupError = msg(e); }
  try { await sendBriefing(); out.briefing = "sent"; } catch (e) { out.briefingError = msg(e); }
  // Surface failures as a non-200 so the Vercel Cron dashboard shows red
  // instead of a green run that silently skipped the backup or sync.
  const failed = Object.keys(out).filter((k) => k.endsWith("Error"));
  return NextResponse.json(
    { ok: failed.length === 0, ...out },
    { status: failed.length === 0 ? 200 : 500 },
  );
}

export async function GET() {
  return run();
}
export async function POST() {
  return run();
}

import { NextResponse } from "next/server";

import { db, USER_ID } from "@/lib/db";

/** Which integrations are wired up — presence booleans only, never values. */
export async function GET() {
  let plaid = false;
  try {
    const { data } = await db()
      .from("plaid_items")
      .select("id")
      .eq("user_id", USER_ID)
      .limit(1);
    plaid = (data ?? []).length > 0;
  } catch {
    /* leave false */
  }
  return NextResponse.json({
    telegram: !!process.env.TELEGRAM_BOT_TOKEN,
    plaid,
    canvas: !!process.env.CANVAS_BASE_URL && !!process.env.CANVAS_ACCESS_TOKEN,
    gcal: !!process.env.GOOGLE_CALENDAR_ICAL_URL,
    memory: !!process.env.SUPERMEMORY_API_KEY,
  });
}

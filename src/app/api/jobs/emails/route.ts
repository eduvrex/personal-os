import { NextResponse } from "next/server";

import { listJobEmails } from "@/lib/jobEmails";

/** Session-authed: unhandled job-search email items for the Applications tab. */
export async function GET() {
  try {
    return NextResponse.json(await listJobEmails());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { runBackup } from "@/lib/backup";

export const maxDuration = 120;

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...(await runBackup()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/backup";

export const maxDuration = 120;

export async function GET() {
  try {
    const snapshot = await buildSnapshot();
    // This copy leaves the server for the browser's Downloads folder — strip
    // the Plaid access tokens. Restoring a download reconnects banks via Link
    // anyway; only the private backups bucket keeps the (encrypted) tokens.
    snapshot.tables.plaid_items = (snapshot.tables.plaid_items ?? []).map((row) => ({
      ...(row as Record<string, unknown>),
      access_token: "[redacted]",
    }));
    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="personal-os-backup-${snapshot.generated_at.slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

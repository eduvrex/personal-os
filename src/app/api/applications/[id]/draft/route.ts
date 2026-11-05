import { NextResponse, type NextRequest } from "next/server";

import { draftApplication } from "@/lib/applications";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { isUuid } from "@/lib/validate";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const limit = rateLimit("draft", 5, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }
  try {
    const app = await draftApplication(id);
    if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(app);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

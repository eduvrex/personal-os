import { NextResponse, type NextRequest } from "next/server";

import { createFeed, listFeeds } from "@/lib/calendarFeeds";
import { asObject, oneOf, optStr, reqStr, ValidationError } from "@/lib/validate";

/**
 * Calendar feeds (Google / Microsoft / any ICS). The URL is accepted on
 * create, encrypted at rest, and never returned by any endpoint.
 */

export async function GET() {
  try {
    return NextResponse.json(await listFeeds());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let name: string;
  let url: string;
  let provider: "google" | "microsoft" | "other";
  let color: string | null;
  try {
    const body = asObject(await request.json().catch(() => null));
    name = reqStr(body.name, "name", 120);
    url = reqStr(body.url, "url", 2000);
    provider = body.provider == null
      ? "other"
      : oneOf(body.provider, "provider", ["google", "microsoft", "other"] as const) ?? "other";
    color = optStr(body.color, "color", 20);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await createFeed({ name, url, provider, color }));
  } catch (e) {
    const invalid = e instanceof ValidationError;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: invalid ? 400 : 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { setCategoryOverride } from "@/lib/spending";
import { asObject, optStr, reqStr, ValidationError } from "@/lib/validate";

/** Re-categorize a merchant (remembered for past + future transactions). */
export async function POST(request: NextRequest) {
  let key: string;
  let category: string | null;
  try {
    const body = asObject(await request.json().catch(() => null));
    key = reqStr(body.matchKey, "matchKey", 80).toLowerCase();
    // null / empty category clears the override (back to Plaid's category).
    category = optStr(body.category, "category", 60);
    if (category) category = category.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (category === "") category = null;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    await setCategoryOverride(key, category);
    return NextResponse.json({ ok: true, matchKey: key, category });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    const hint = /category_overrides/.test(msg)
      ? "Run migration 0005 in the Supabase SQL Editor first."
      : msg;
    return NextResponse.json({ error: hint }, { status: 500 });
  }
}

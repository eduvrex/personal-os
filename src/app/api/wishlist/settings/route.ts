import { NextResponse, type NextRequest } from "next/server";

import { asObject, optNum } from "@/lib/validate";
import { setCap } from "@/lib/wishlist";

/** PATCH { monthly_cap } — the monthly limit on wish-list purchases. */
export async function PATCH(request: NextRequest) {
  let cap: number | null;
  try {
    cap = optNum(asObject(await request.json().catch(() => null)).monthly_cap, "monthly_cap", 0, 100_000);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid body." }, { status: 400 });
  }
  if (cap == null) return NextResponse.json({ error: "monthly_cap is required." }, { status: 400 });
  try {
    return NextResponse.json({ monthly_cap: await setCap(cap) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

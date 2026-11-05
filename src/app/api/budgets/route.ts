import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID } from "@/lib/db";

/** Set (or clear) a monthly budget for a category. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const category = String(body?.category ?? "").trim().slice(0, 100);
  if (!category) {
    return NextResponse.json({ error: "category is required." }, { status: 400 });
  }
  const limit = Math.min(Number(body?.monthly_limit), 1e9);

  try {
    if (!Number.isFinite(limit) || limit <= 0) {
      // Clear the budget.
      const { error } = await db()
        .from("budgets")
        .delete()
        .eq("user_id", USER_ID)
        .eq("category", category);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, cleared: true });
    }

    const { error } = await db()
      .from("budgets")
      .upsert(
        { user_id: USER_ID, category, monthly_limit: limit },
        { onConflict: "user_id,category" },
      );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, category, monthly_limit: limit });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID, type RawCaptureRow } from "@/lib/db";

/** Recent raw captures, newest first, plus a total count. */
export async function GET(request: NextRequest) {
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 5;

  try {
    const { data, error, count } = await db()
      .from("raw_captures")
      .select("id,raw_text,routed_to,created_at", { count: "exact" })
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const items = (data as Pick<
      RawCaptureRow,
      "id" | "raw_text" | "routed_to" | "created_at"
    >[]).map((r) => ({
      id: r.id,
      text: r.raw_text,
      routed_to: r.routed_to,
      created_at: r.created_at,
    }));

    return NextResponse.json({ count: count ?? 0, items });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { buildSpending } from "@/lib/spending";

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month") ?? undefined;
    return NextResponse.json(await buildSpending(month));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

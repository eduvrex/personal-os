import { NextResponse, type NextRequest } from "next/server";

import { createPlan, currentSavings, listPlans } from "@/lib/plans";
import { isUuid, optDateKey, optStr, ValidationError } from "@/lib/validate";

export async function GET() {
  try {
    const [plans, savings] = await Promise.all([listPlans(), currentSavings()]);
    return NextResponse.json({ plans, savings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  try {
    const plan = await createPlan({
      title: title.slice(0, 300),
      parent_id: typeof body?.parent_id === "string" && isUuid(body.parent_id) ? body.parent_id : null,
      category: optStr(body?.category, "category", 50),
      target_date: optDateKey(body?.target_date, "target_date"),
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { updatePlan } from "@/lib/plans";
import {
  asObject,
  isUuid,
  milestoneArray,
  optDateKey,
  optNum,
  optStr,
  ValidationError,
} from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  let patch: Record<string, unknown>;
  try {
    const body = asObject(await request.json().catch(() => null));
    patch = {};
    if ("title" in body) patch.title = optStr(body.title, "title", 300) ?? "";
    if ("notes" in body) patch.notes = optStr(body.notes, "notes", 10_000);
    if ("target_date" in body) patch.target_date = optDateKey(body.target_date, "target_date");
    if ("category" in body) patch.category = optStr(body.category, "category", 50);
    if ("status" in body) patch.status = optStr(body.status, "status", 30);
    if ("savings_target" in body) patch.savings_target = optNum(body.savings_target, "savings_target", 0, 1e9) ?? 0;
    if ("milestones" in body) patch.milestones = milestoneArray(body.milestones, "milestones");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    const plan = await updatePlan(id, patch);
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { db, USER_ID, type TaskRow } from "@/lib/db";
import { toTaskDTO } from "@/lib/tasks";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));

  const patch: Partial<TaskRow> = { updated_at: new Date().toISOString() };
  if ("done" in body) {
    patch.completed_at = body.done ? new Date().toISOString() : null;
  }
  if (typeof body?.title === "string") patch.title = body.title.trim().slice(0, 500);
  if (["inbox", "today", "week", "later"].includes(body?.urgency)) patch.urgency = body.urgency;
  if ("key" in body) patch.key = Boolean(body.key);
  if ("time_estimate_min" in body) {
    const v = body.time_estimate_min;
    patch.time_estimate_min =
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10_000, Math.round(v))) : null;
  }
  if (body?.domain === "school" || body?.domain === "personal") patch.domain = body.domain;
  if ("due_date" in body) {
    // Set with a valid YYYY-MM-DD, anything else clears it.
    const key = typeof body.due_date === "string" ? body.due_date.slice(0, 10) : "";
    patch.due_date =
      /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00Z`)) ? key : null;
  }
  if ("due_time" in body) {
    patch.due_time =
      typeof body.due_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.due_time)
        ? body.due_time
        : null;
  }

  const { data, error } = await db()
    .from("tasks")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found." }, { status: 404 });

  return NextResponse.json(toTaskDTO(data as TaskRow, null));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 204 });
  const { error } = await db()
    .from("tasks")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

import { NextResponse, type NextRequest } from "next/server";

import { ensureCourse } from "@/lib/courses";
import { createTask, queryTasks, toTaskDTO } from "@/lib/tasks";
import { isUuid } from "@/lib/validate";

const URGENCIES = ["inbox", "today", "week", "later"];

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status");
  try {
    const tasks = await queryTasks({
      status: status === "open" || status === "done" ? status : null,
      domain: sp.get("domain"),
      urgency: sp.get("urgency"),
      course: sp.get("course"),
    });
    return NextResponse.json(tasks);
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const title = String(body?.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (title.length > 500) {
    return NextResponse.json({ error: "Title is capped at 500 characters." }, { status: 400 });
  }
  if (typeof body?.course === "string" && body.course.length > 200) {
    return NextResponse.json({ error: "Course name is capped at 200 characters." }, { status: 400 });
  }

  const DOMAINS = ["school", "personal", "work", "finance", "akrov"];
  const domain = DOMAINS.includes(String(body?.domain)) ? String(body.domain) : "personal";
  const urgency = URGENCIES.includes(body?.urgency) ? body.urgency : "today";

  // Optional due date — also surfaces the task on the calendar.
  let dueDate: string | null = null;
  if (body?.due_date != null && body.due_date !== "") {
    const key = typeof body.due_date === "string" ? body.due_date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || Number.isNaN(Date.parse(`${key}T00:00:00Z`))) {
      return NextResponse.json({ error: "due_date must be a YYYY-MM-DD date." }, { status: 400 });
    }
    dueDate = key;
  }
  let dueTime: string | null = null;
  if (body?.due_time != null && body.due_time !== "") {
    dueTime = typeof body.due_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.due_time)
      ? body.due_time
      : null;
    if (!dueTime) {
      return NextResponse.json({ error: "due_time must be an HH:MM time." }, { status: 400 });
    }
  }

  try {
    // Resolve the course: explicit id wins, else create/find by name.
    let entityId: string | null =
      typeof body?.course_id === "string" && isUuid(body.course_id) ? body.course_id : null;
    if (!entityId && typeof body?.course === "string" && body.course.trim()) {
      entityId = await ensureCourse(body.course);
    }

    const row = await createTask({
      title,
      domain,
      urgency,
      key: Boolean(body?.key),
      tags: Array.isArray(body?.tags) ? body.tags : [],
      time_estimate_min:
        typeof body?.time_estimate_min === "number"
          ? body.time_estimate_min
          : null,
      entity_id: entityId,
      due_date: dueDate,
      due_time: dueTime,
    });

    return NextResponse.json(toTaskDTO(row, null), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error.";
}

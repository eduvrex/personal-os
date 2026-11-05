import { NextResponse, type NextRequest } from "next/server";

import { convertEmailToTask, dismissEmail } from "@/lib/akrov";
import { asObject, isUuid, ValidationError } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/** PATCH { action: "task" | "dismiss" } — convert to an akrov task, or drop. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const body = asObject(await request.json().catch(() => null));
    const action = String(body.action ?? "");
    if (action === "task") return NextResponse.json(await convertEmailToTask(id));
    if (action === "dismiss") {
      await dismissEmail(id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof ValidationError) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

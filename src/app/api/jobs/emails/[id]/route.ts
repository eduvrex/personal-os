import { NextResponse, type NextRequest } from "next/server";

import { convertJobEmailToTask, dismissJobEmail, linkJobEmail } from "@/lib/jobEmails";
import { asObject, isUuid, ValidationError } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH { action: "task" | "dismiss" | "link", application_id? }
 * — convert to a work-domain task, drop it, or correct which application it
 * belongs to (application_id null clears the link).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    const body = asObject(await request.json().catch(() => null));
    const action = String(body.action ?? "");
    if (action === "task") return NextResponse.json(await convertJobEmailToTask(id));
    if (action === "dismiss") {
      await dismissJobEmail(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "link") {
      const raw = body.application_id;
      if (raw !== null && (typeof raw !== "string" || !isUuid(raw))) {
        return NextResponse.json({ error: "application_id must be a uuid or null." }, { status: 400 });
      }
      await linkJobEmail(id, raw as string | null);
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

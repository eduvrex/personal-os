import { NextResponse, type NextRequest } from "next/server";
import { deleteEvent, updateEvent } from "@/lib/calendar";
import {
  asObject,
  isUuid,
  optHexColor,
  optIsoDate,
  optStr,
  ValidationError,
} from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let patch: Record<string, unknown>;
  try {
    const body = asObject(await request.json().catch(() => null));
    patch = {};
    if ("title" in body) patch.title = optStr(body.title, "title", 300) ?? "";
    if ("category" in body) patch.category = optStr(body.category, "category", 100);
    if ("start" in body) patch.start = optIsoDate(body.start, "start");
    if ("end" in body) patch.end = optIsoDate(body.end, "end");
    if ("all_day" in body) patch.all_day = Boolean(body.all_day);
    if ("notes" in body) patch.notes = optStr(body.notes, "notes", 5000);
    if ("color" in body) patch.color = optHexColor(body.color, "color");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    const event = await updateEvent(id, patch);
    if (!event) return NextResponse.json({ error: "Not found or not editable." }, { status: 404 });
    return NextResponse.json(event);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 204 });
  try {
    await deleteEvent(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { createEvent } from "@/lib/calendar";
import {
  asObject,
  optHexColor,
  optIsoDate,
  optStr,
  reqStr,
  ValidationError,
} from "@/lib/validate";

export async function POST(request: NextRequest) {
  let input: Parameters<typeof createEvent>[0];
  try {
    const body = asObject(await request.json().catch(() => null));
    const start = optIsoDate(body.start, "start");
    if (!start) throw new ValidationError("start is required.");
    input = {
      title: reqStr(body.title, "title", 300),
      category: optStr(body.category, "category", 100) ?? "General",
      start,
      end: optIsoDate(body.end, "end"),
      all_day: Boolean(body.all_day),
      notes: optStr(body.notes, "notes", 5000),
      color: optHexColor(body.color, "color"),
    };
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createEvent(input), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

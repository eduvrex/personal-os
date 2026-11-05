import { NextResponse, type NextRequest } from "next/server";

import { rerouteCapture } from "@/lib/capture";
import { isUuid } from "@/lib/validate";
import type { CaptureRoute } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const ROUTES: CaptureRoute[] = [
  "task", "event", "journal", "note", "personal", "plan", "reading", "application",
];

/** Re-route a capture (the undo behind the capture toast). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Capture not found." }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  const route = body?.route as CaptureRoute;
  if (!ROUTES.includes(route)) {
    return NextResponse.json({ error: "Invalid route." }, { status: 400 });
  }

  try {
    const result = await rerouteCapture(id, route);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error.";
    const status = message === "Capture not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { updatePath } from "@/lib/paths";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Path not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const path = await updatePath(id, {
      title: typeof body?.title === "string" ? body.title.slice(0, 300) : undefined,
      description: "description" in body
        ? (typeof body.description === "string" ? body.description.slice(0, 5000) : null)
        : undefined,
      milestones: Array.isArray(body?.milestones) ? body.milestones.slice(0, 200) : undefined,
      status: typeof body?.status === "string" ? body.status.slice(0, 30) : undefined,
    });
    if (!path) {
      return NextResponse.json({ error: "Path not found." }, { status: 404 });
    }
    return NextResponse.json(path);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { createPath, listPaths } from "@/lib/paths";

export async function GET() {
  try {
    return NextResponse.json(await listPaths());
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
    const path = await createPath({
      title: title.slice(0, 300),
      description: typeof body?.description === "string" ? body.description.slice(0, 5000) : null,
      milestones: Array.isArray(body?.milestones) ? body.milestones.slice(0, 200) : [],
    });
    return NextResponse.json(path, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

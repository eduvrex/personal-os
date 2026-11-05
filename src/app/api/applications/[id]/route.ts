import { NextResponse, type NextRequest } from "next/server";

import { isUuid } from "@/lib/validate";

import { updateApplication } from "@/lib/applications";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const app = await updateApplication(id, body);
    if (!app) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json(app);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

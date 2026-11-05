import { NextResponse, type NextRequest } from "next/server";

import { createApplication, listApplications } from "@/lib/applications";

export async function GET() {
  try {
    return NextResponse.json(await listApplications());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!String(body?.title ?? "").trim() && !String(body?.org ?? "").trim()) {
    return NextResponse.json({ error: "Org or title is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await createApplication(body), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

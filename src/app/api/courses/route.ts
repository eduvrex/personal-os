import { NextResponse, type NextRequest } from "next/server";

import { ensureCourse, listCourses } from "@/lib/courses";

export async function GET() {
  try {
    return NextResponse.json(await listCourses());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Course name is required." }, { status: 400 });
  }
  try {
    const id = await ensureCourse(name);
    return NextResponse.json({ id, name }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { addCategory, listCategories } from "@/lib/calendar";

export async function GET() {
  try {
    return NextResponse.json(await listCategories());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim().slice(0, 100);
  const color = String(body?.color ?? "").trim();
  if (!name || !color) {
    return NextResponse.json({ error: "name and color are required." }, { status: 400 });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "color must be #rrggbb." }, { status: 400 });
  }
  try {
    return NextResponse.json(await addCategory(name, color), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

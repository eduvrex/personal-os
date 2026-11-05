import { NextResponse, type NextRequest } from "next/server";

import { deleteFeed, updateFeed } from "@/lib/calendarFeeds";
import { asObject, optStr, reqUuid, ValidationError } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = reqUuid((await params).id);
    const body = asObject(await request.json().catch(() => null));
    const patch: { name?: string; color?: string | null; visible?: boolean; url?: string } = {};
    const name = optStr(body.name, "name", 120);
    if (name) patch.name = name;
    if ("color" in body) patch.color = optStr(body.color, "color", 20);
    if (typeof body.visible === "boolean") patch.visible = body.visible;
    const url = optStr(body.url, "url", 2000);
    if (url) patch.url = url;

    const feed = await updateFeed(id, patch);
    if (!feed) return NextResponse.json({ error: "Feed not found." }, { status: 404 });
    return NextResponse.json(feed);
  } catch (e) {
    const invalid = e instanceof ValidationError;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: invalid ? 400 : 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const id = reqUuid((await params).id);
    await deleteFeed(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const invalid = e instanceof ValidationError;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: invalid ? 400 : 500 },
    );
  }
}

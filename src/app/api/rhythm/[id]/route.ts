import { NextResponse, type NextRequest } from "next/server";

import { deleteBlock, parseBlockBody, updateBlock, type BlockInput } from "@/lib/rhythm";
import { asObject, isUuid, ValidationError } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Block not found." }, { status: 404 });

  let patch: Partial<BlockInput> & { active?: boolean; sort?: number };
  try {
    const body = asObject(await request.json().catch(() => null));
    // A bare toggle / reorder shouldn't require re-sending the whole block.
    if (!("label" in body)) {
      patch = {};
      if ("active" in body) patch.active = Boolean(body.active);
      if ("sort" in body && Number.isFinite(Number(body.sort))) patch.sort = Number(body.sort);
      if ("at_time" in body) {
        const t = String(body.at_time ?? "").trim();
        patch.at_time = /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null;
      }
    } else {
      patch = parseBlockBody(body);
      if ("active" in body) patch.active = Boolean(body.active);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateBlock(id, patch);
    if (!updated) return NextResponse.json({ error: "Block not found." }, { status: 404 });
    return NextResponse.json(updated);
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
    await deleteBlock(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

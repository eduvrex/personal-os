import { NextResponse, type NextRequest } from "next/server";

import { asObject, isUuid } from "@/lib/validate";
import { deleteWish, parseWishPatch, updateWish } from "@/lib/wishlist";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Item not found." }, { status: 404 });
  let patch;
  try {
    patch = parseWishPatch(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid body." }, { status: 400 });
  }
  try {
    const updated = await updateWish(id, patch);
    if (!updated) return NextResponse.json({ error: "Item not found." }, { status: 404 });
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
    await deleteWish(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

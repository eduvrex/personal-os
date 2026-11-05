import { NextResponse, type NextRequest } from "next/server";

import {
  deleteKnowledgeItem,
  parseKnowledgeBody,
  updateKnowledgeItem,
  type KnowledgeInput,
} from "@/lib/knowledgeBase";
import { asObject, isUuid, oneOf, optNum, optStr, ValidationError } from "@/lib/validate";
import type { KnowledgeTier } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  let patch: Partial<KnowledgeInput>;
  try {
    const body = asObject(await request.json().catch(() => null));
    // Partial edits (tier toggle, content tweak) shouldn't require the full body.
    if (!("content" in body) || !("section" in body)) {
      patch = {};
      if ("section" in body) patch.section = optStr(body.section, "section", 120) ?? undefined;
      if ("content" in body) patch.content = optStr(body.content, "content", 8000) ?? undefined;
      if ("tier" in body) {
        patch.tier = (oneOf(body.tier, "tier", ["public", "private"] as const) ??
          "public") as KnowledgeTier;
      }
      if ("sort" in body) patch.sort = optNum(body.sort, "sort", 0, 100000) ?? undefined;
    } else {
      patch = parseKnowledgeBody(body);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateKnowledgeItem(id, patch);
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
    await deleteKnowledgeItem(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

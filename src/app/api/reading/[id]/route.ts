import { NextResponse, type NextRequest } from "next/server";

import { deleteBook, parseBookBody, updateBook, type BookInput } from "@/lib/reading";
import { asObject, isUuid, oneOf, optNum, optStr, ValidationError } from "@/lib/validate";
import type { ReadingStatus } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  let patch: Partial<BookInput>;
  try {
    const body = asObject(await request.json().catch(() => null));
    if (!("title" in body)) {
      // Partial update (status change, progress bump, note edit).
      patch = {};
      if ("status" in body) {
        patch.status = (oneOf(body.status, "status", ["want", "reading", "finished"] as const) ??
          "want") as ReadingStatus;
      }
      if ("current_page" in body) patch.current_page = optNum(body.current_page, "current_page", 0, 100_000);
      if ("total_pages" in body) patch.total_pages = optNum(body.total_pages, "total_pages", 0, 100_000);
      if ("progress_pct" in body) patch.progress_pct = optNum(body.progress_pct, "progress_pct", 0, 100);
      if ("notes" in body) patch.notes = optStr(body.notes, "notes", 4000);
      if ("author" in body) patch.author = optStr(body.author, "author", 200);
    } else {
      patch = parseBookBody(body);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const updated = await updateBook(id, patch);
    if (!updated) return NextResponse.json({ error: "Book not found." }, { status: 404 });
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
    await deleteBook(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { deleteWorkout } from "@/lib/fitness";
import { isUuid } from "@/lib/validate";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 204 });
  try {
    await deleteWorkout(id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

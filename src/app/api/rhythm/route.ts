import { NextResponse, type NextRequest } from "next/server";

import { createBlock, listRhythm, parseBlockBody, type BlockInput } from "@/lib/rhythm";
import { asObject, ValidationError } from "@/lib/validate";

export async function GET() {
  try {
    return NextResponse.json(await listRhythm());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let input: BlockInput;
  try {
    input = parseBlockBody(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createBlock(input), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

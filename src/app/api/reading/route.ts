import { NextResponse, type NextRequest } from "next/server";

import { addBook, listReading, parseBookBody, type BookInput } from "@/lib/reading";
import { asObject, ValidationError } from "@/lib/validate";

export async function GET() {
  try {
    return NextResponse.json(await listReading());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let input: BookInput;
  try {
    input = parseBookBody(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await addBook(input), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

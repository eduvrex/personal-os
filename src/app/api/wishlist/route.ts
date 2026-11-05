import { NextResponse, type NextRequest } from "next/server";

import { asObject } from "@/lib/validate";
import { createWish, getWishlist, parseWishBody } from "@/lib/wishlist";

export async function GET() {
  try {
    return NextResponse.json(await getWishlist());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let input;
  try {
    input = parseWishBody(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid body." }, { status: 400 });
  }
  try {
    return NextResponse.json(await createWish(input), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

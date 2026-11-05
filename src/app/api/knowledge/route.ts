import { NextResponse, type NextRequest } from "next/server";

import {
  createKnowledgeItem,
  listKnowledge,
  parseKnowledgeBody,
  type KnowledgeInput,
} from "@/lib/knowledgeBase";
import { asObject, ValidationError } from "@/lib/validate";

/**
 * The Me-tab knowledge base editor. This is an authenticated, single-user
 * surface, so it returns BOTH tiers (the owner manages his own private items);
 * the privacy tier only gates what the assistant surfaces publicly.
 */
export async function GET() {
  try {
    return NextResponse.json(await listKnowledge());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let input: KnowledgeInput;
  try {
    input = parseKnowledgeBody(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createKnowledgeItem(input), { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { askAdvisor } from "@/lib/advisor";
import { DEBT_COOKIE, verifyUnlockToken } from "@/lib/financeLock";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { asObject, reqStr, ValidationError } from "@/lib/validate";

// 120s: extended thinking on the heavy model can spend a while before text.
export const maxDuration = 120;

/**
 * Money Q&A grounded in real finance data. Requires the debt privacy screen
 * to be UNLOCKED — the answers necessarily discuss debt detail. Heavy model;
 * explicit paid action in the UI.
 */
export async function POST(request: NextRequest) {
  const limit = rateLimit("advisor", 5, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }

  const unlocked = await verifyUnlockToken(request.cookies.get(DEBT_COOKIE)?.value);
  if (!unlocked) {
    return NextResponse.json(
      { error: "Unlock the debt privacy screen first — advisor answers discuss debt detail." },
      { status: 423 },
    );
  }

  let question: string;
  try {
    const body = asObject(await request.json().catch(() => null));
    question = reqStr(body.question, "question", 2000);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({ answer: await askAdvisor(question) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

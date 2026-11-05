import { NextResponse, type NextRequest } from "next/server";

import { secretsMatch } from "@/lib/auth/session";
import { createUnlockToken, DEBT_COOKIE } from "@/lib/financeLock";
import { rateLimit, tooMany } from "@/lib/rateLimit";

/**
 * Unlock the debt privacy screen with FINANCE_PIN. The cookie is
 * browser-session only; the token inside carries its own 30-minute expiry.
 */
export async function POST(request: NextRequest) {
  // PINs are short — brute-force protection matters more than convenience.
  const limit = rateLimit("finance-unlock", 5, 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }

  const expected = process.env.FINANCE_PIN;
  if (!expected) {
    return NextResponse.json(
      { error: "Set FINANCE_PIN in the environment to enable unlocking." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const pin = String(body?.pin ?? "").trim();
  if (!pin || pin.length > 64 || !(await secretsMatch(pin, expected))) {
    return NextResponse.json({ error: "Wrong PIN." }, { status: 401 });
  }

  const response = NextResponse.json({ unlocked: true });
  response.cookies.set({
    name: DEBT_COOKIE,
    value: await createUnlockToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // No maxAge: dies with the browser session; token self-expires in 30 min.
  });
  return response;
}

/** Manual re-lock. */
export async function DELETE() {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.set({ name: DEBT_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}

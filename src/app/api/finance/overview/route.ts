import { NextResponse, type NextRequest } from "next/server";

import { buildFinanceOverview, redactFinanceOverview } from "@/lib/financeOverview";
import { DEBT_COOKIE, verifyUnlockToken } from "@/lib/financeLock";

/**
 * Finance overview. Debt detail is a privacy screen: it is REDACTED from the
 * response unless the debt-unlock cookie is valid. Fail-closed — no
 * FINANCE_PIN configured means debt stays hidden (the unlock route explains).
 */
export async function GET(request: NextRequest) {
  try {
    const full = await buildFinanceOverview();
    const unlocked = await verifyUnlockToken(
      request.cookies.get(DEBT_COOKIE)?.value,
    );
    return NextResponse.json(unlocked ? full : redactFinanceOverview(full));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

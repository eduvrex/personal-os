import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  createUnlockToken,
  DEBT_UNLOCK_MAX_AGE,
  verifyUnlockToken,
} from "@/lib/financeLock";
import { redactFinanceOverview } from "@/lib/financeOverview";
import type { FinanceOverviewDTO } from "@/lib/types";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

describe("debt unlock token", () => {
  it("round-trips", async () => {
    expect(await verifyUnlockToken(await createUnlockToken())).toBe(true);
  });

  it("rejects garbage and tampering", async () => {
    expect(await verifyUnlockToken(undefined)).toBe(false);
    expect(await verifyUnlockToken("nope")).toBe(false);
    const token = await createUnlockToken();
    const [payload, sig] = token.split(".");
    expect(await verifyUnlockToken(`${payload}x.${sig}`)).toBe(false);
  });

  it("a session token is NOT an unlock token (scope check)", async () => {
    // Same signing key, different payload shape — must not cross over.
    const { createSessionToken } = await import("@/lib/auth/session");
    expect(await verifyUnlockToken(await createSessionToken())).toBe(false);
  });

  it("expires after 30 minutes", async () => {
    const token = await createUnlockToken();
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime((DEBT_UNLOCK_MAX_AGE + 60) * 1000);
      expect(await verifyUnlockToken(token)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("redactFinanceOverview — the debt privacy screen", () => {
  const full: FinanceOverviewDTO = {
    connected: true,
    netWorth: -7000,
    assets: 1500,
    debts: 8500,
    cardDebt: 500,
    loanDebt: 8000,
    accounts: [
      { id: "1", name: "Checking", type: "depository", subtype: "checking", mask: "1234", current_balance: 1000, available_balance: 1000, credit_limit: null, source: "plaid" },
      { id: "2", name: "Student Loan", type: "loan", subtype: "student", mask: null, current_balance: 8000, available_balance: null, credit_limit: null, source: "plaid" },
      { id: "3", name: "Visa", type: "credit", subtype: "credit card", mask: "9999", current_balance: 500, available_balance: null, credit_limit: 2000, source: "plaid" },
    ],
    cards: [
      { id: "c1", name: "Visa", issuer: "Bank", balance: 500, credit_limit: 2000, minimum_payment: 25, due_day: null, next_due_date: "2026-07-15", apr: 24.99, source: "plaid", utilization: 0.25, overLimit: false, dueSoon: false, dueLabel: "2026-07-15" },
    ],
    items: [
      { id: "i1", institution: "Bank", status: "login_required", needsReconnect: true, accounts: [] },
    ],
    spending: { month: "2026-07", total: 300, categories: [] },
    budgets: [],
  };

  it("keeps only assets, non-debt accounts, item health, spending, budgets", () => {
    const locked = redactFinanceOverview(full);
    expect(locked.locked).toBe(true);
    expect(locked.assets).toBe(1500);
    expect(locked.accounts.map((a) => a.name)).toEqual(["Checking"]);
    expect(locked.spending.total).toBe(300);
    // Connection health survives the lock (no balances in it) so a broken
    // bank login is still fixable from the locked view.
    expect(locked.items.map((i) => i.needsReconnect)).toEqual([true]);
  });

  it("leaks NO debt field — even ones added later", () => {
    const locked = redactFinanceOverview(full) as unknown as Record<string, unknown>;
    for (const forbidden of ["netWorth", "debts", "cardDebt", "loanDebt", "cards"]) {
      expect(locked[forbidden], `field ${forbidden} must be absent`).toBeUndefined();
    }
    // The serialized payload must never contain debt numbers or card names.
    const json = JSON.stringify(locked);
    expect(json).not.toContain("8500");
    expect(json).not.toContain("24.99");
    expect(json).not.toContain("Visa");
    expect(json).not.toContain("Student Loan");
  });
});

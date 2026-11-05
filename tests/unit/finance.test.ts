import { describe, expect, it } from "vitest";

import { financeTotals, resolveDue } from "@/lib/financeOverview";

describe("net-worth math", () => {
  it("assets minus card + loan debt", () => {
    const accounts = [
      { type: "depository", current_balance: 1000 },
      { type: "depository", current_balance: "250.50" },
      { type: "investment", current_balance: 500 },
      { type: "loan", current_balance: 8000 },
      { type: "credit", current_balance: 999 }, // credit accounts are NOT assets
    ];
    const cards = [{ balance: 400 }, { balance: "100.25" }];
    const t = financeTotals(accounts, cards);
    expect(t.assets).toBeCloseTo(1750.5);
    expect(t.loanDebt).toBe(8000);
    expect(t.cardDebt).toBeCloseTo(500.25);
    expect(t.debts).toBeCloseTo(8500.25);
    expect(t.netWorth).toBeCloseTo(1750.5 - 8500.25);
  });

  it("handles empty tables and junk values", () => {
    const t = financeTotals([], []);
    expect(t.netWorth).toBe(0);
    const junk = financeTotals(
      [{ type: "depository", current_balance: "not-a-number" }],
      [{ balance: null }],
    );
    expect(junk.netWorth).toBe(0);
  });
});

describe("card due dates", () => {
  it("uses next_due_date when present and flags due-soon within 5 days", () => {
    expect(resolveDue("2026-07-01", "2026-07-04", null)).toEqual({
      dueSoon: true,
      dueLabel: "2026-07-04",
    });
    expect(resolveDue("2026-07-01", "2026-07-20", null).dueSoon).toBe(false);
    // past-due dates are not "due soon"
    expect(resolveDue("2026-07-01", "2026-06-28", null).dueSoon).toBe(false);
  });

  it("derives the next occurrence from due_day, rolling into next month", () => {
    // due_day 4 seen from July 1 → July 4 (3 days → due soon)
    expect(resolveDue("2026-07-01", null, 4)).toEqual({
      dueSoon: true,
      dueLabel: "2026-07-04",
    });
    // due_day 15 seen from July 20 → Aug 15
    expect(resolveDue("2026-07-20", null, 15).dueLabel).toBe("2026-08-15");
    // December rollover
    expect(resolveDue("2026-12-30", null, 5).dueLabel).toBe("2027-01-05");
  });

  it("no info → no flag", () => {
    expect(resolveDue("2026-07-01", null, null)).toEqual({
      dueSoon: false,
      dueLabel: null,
    });
  });

  it("stale next_due_date falls back to due_day instead of showing a past date", () => {
    // Plaid's next_due_date already passed between syncs; due_day recovers.
    expect(resolveDue("2026-07-10", "2026-07-03", 3).dueLabel).toBe("2026-08-03");
    // No due_day to fall back to → hide rather than render a past date.
    expect(resolveDue("2026-07-10", "2026-07-03", null)).toEqual({
      dueSoon: false,
      dueLabel: null,
    });
  });

  it("clamps due_day to the month's last day instead of overflowing", () => {
    // due_day 31 in a 30-day month → Apr 30, not an invalid Apr 31.
    expect(resolveDue("2026-04-01", null, 31).dueLabel).toBe("2026-04-30");
    // February non-leap year
    expect(resolveDue("2026-02-01", null, 30).dueLabel).toBe("2026-02-28");
  });
});

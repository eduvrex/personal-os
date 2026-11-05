import { describe, expect, it } from "vitest";

import { cleanName, computeInsights, humanCategory, matchKey } from "@/lib/spending";
import type { TransactionDTO } from "@/lib/types";

function txn(p: Partial<TransactionDTO>): TransactionDTO {
  return {
    id: "x", date: "2026-07-05", name: "X", amount: 10, category: "FOOD_AND_DRINK",
    rawCategory: "FOOD_AND_DRINK", overridden: false, matchKey: "x",
    pending: false, account: null, ...p,
  };
}

describe("matchKey — one override covers the whole merchant", () => {
  it("normalizes store numbers, case, punctuation", () => {
    expect(matchKey("STARBUCKS #1234", null)).toBe("starbucks");
    expect(matchKey(null, "Starbucks 0987")).toBe("starbucks");
    expect(matchKey("UBER *EATS 8899", null)).toBe("uber eats");
  });
  it("keeps distinct merchants distinct", () => {
    expect(matchKey("Netflix.com", null)).not.toBe(matchKey("Spotify AB", null));
  });
});

describe("insights are deterministic and neutral", () => {
  it("detects same-amount recurring charges across months", () => {
    const txns = [
      txn({ id: "1", date: "2026-05-14", name: "Netflix", matchKey: "netflix", amount: 15.49 }),
      txn({ id: "2", date: "2026-06-14", name: "Netflix", matchKey: "netflix", amount: 15.49 }),
      txn({ id: "3", date: "2026-07-14", name: "Netflix", matchKey: "netflix", amount: 15.49 }),
    ];
    const out = computeInsights(txns, "2026-07");
    const subs = out.find((i) => i.kind === "subscriptions");
    expect(subs?.detail).toContain("Netflix");
  });

  it("does not call one-off purchases subscriptions", () => {
    const txns = [
      txn({ id: "1", date: "2026-06-01", name: "Amazon", matchKey: "amazon", amount: 12 }),
      txn({ id: "2", date: "2026-07-01", name: "Amazon", matchKey: "amazon", amount: 89 }),
    ];
    const subs = computeInsights(txns, "2026-07").find((i) => i.kind === "subscriptions");
    expect(subs).toBeUndefined();
  });

  it("flags unusually large charges (3x median, min $50)", () => {
    const txns = [
      ...Array.from({ length: 10 }, (_, i) =>
        txn({ id: `s${i}`, amount: 12, matchKey: `m${i}` })),
      txn({ id: "big", name: "Apple Store", amount: 900, matchKey: "apple store" }),
    ];
    const big = computeInsights(txns, "2026-07").find((i) => i.kind === "large_charges");
    expect(big?.detail).toContain("Apple Store");
  });

  it("top categories reads as info, not instruction", () => {
    const out = computeInsights([txn({ amount: 40 })], "2026-07");
    const top = out.find((i) => i.kind === "top_categories");
    expect(top?.detail).toContain("Food And Drink");
    expect(top?.detail).not.toMatch(/should|must|stop|cut/i);
  });
});

describe("cleanName — bank descriptors become readable", () => {
  it("extracts counterparty + ID from ACH descriptors", () => {
    expect(
      cleanName(null, "PAYPAL DES:PURCHASE ID:PARAMNTPLUS INDN:JANE DOE CO ID:PAYPALSI00 WEB"),
    ).toBe("PayPal · Paramntplus");
  });
  it("tidies plain names", () => {
    expect(cleanName("STARBUCKS", null)).toBe("Starbucks");
    expect(cleanName(null, "")).toBe("—");
  });
});

describe("humanCategory", () => {
  it("prettifies Plaid tokens", () => {
    expect(humanCategory("FOOD_AND_DRINK")).toBe("Food And Drink");
  });
});

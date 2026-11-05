import { describe, expect, it } from "vitest";

import { effectiveBalance } from "@/lib/balance";

describe("effectiveBalance", () => {
  it("uses available for checking when present (BofA: posted 4.44, available 64.49)", () => {
    expect(
      effectiveBalance({ type: "depository", current_balance: 4.44, available_balance: 64.49 }),
    ).toBe(64.49);
  });
  it("falls back to current when available is missing", () => {
    expect(effectiveBalance({ type: "depository", current_balance: "10", available_balance: null })).toBe(10);
  });
  it("keeps current for credit cards", () => {
    expect(effectiveBalance({ type: "credit", current_balance: 506.24, available_balance: 0 })).toBe(506.24);
  });
  it("treats missing numbers as 0", () => {
    expect(effectiveBalance({ type: "loan" })).toBe(0);
  });
});

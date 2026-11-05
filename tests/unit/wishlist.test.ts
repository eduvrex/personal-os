import { describe, expect, it } from "vitest";

import { capStatus, verdictFor, type WishLike } from "@/lib/wishlistMath";

const w = (p: Partial<WishLike>): WishLike => ({
  id: p.id ?? "x",
  price: p.price ?? null,
  target_price: p.target_price ?? null,
  status: p.status ?? "wanting",
  bought_price: p.bought_price ?? null,
  bought_at: p.bought_at ?? null,
});

describe("wish-list cap", () => {
  const items = [
    w({ id: "a", status: "bought", bought_price: 28, bought_at: "2026-10-03" }),
    w({ id: "b", status: "bought", bought_price: 40, bought_at: "2026-09-20" }), // last month
    w({ id: "c", status: "dropped", price: 500 }),
  ];

  it("counts only this month's purchases", () => {
    expect(capStatus(items, 75, "2026-10")).toEqual({ month: "2026-10", cap: 75, spent: 28, remaining: 47 });
  });

  it("gives each wanted item a verdict against what's left", () => {
    const s = capStatus(items, 75, "2026-10");
    expect(verdictFor(w({ price: 28 }), s)).toEqual({ kind: "fits" });
    expect(verdictFor(w({ price: 60 }), s)).toEqual({ kind: "next-month" });
    expect(verdictFor(w({ price: 249, target_price: 190 }), s)).toEqual({ kind: "save", months: 3 });
    expect(verdictFor(w({}), s)).toEqual({ kind: "unpriced" });
  });

  it("judges on the target (deal) price when there is one", () => {
    const s = capStatus([], 200, "2026-10");
    expect(verdictFor(w({ price: 249, target_price: 190 }), s)).toEqual({ kind: "fits" });
  });
});

/**
 * Wish-list cap math — pure and client-safe so the board and tests share it.
 *
 * The rule: wish-list purchases in a calendar month can't exceed the monthly
 * cap. Each "wanting" item gets a verdict against what's left this month:
 *   - fits        → price ≤ remaining: allowed now
 *   - next-month  → doesn't fit now, but fits a fresh month's cap
 *   - save        → costs more than one whole cap: needs N months of cap
 *                   (i.e. skip other wish-list buys until then)
 * Items with no price get "unpriced" — look the price up first.
 */

export interface WishLike {
  id: string;
  price: number | null;
  target_price: number | null;
  status: "wanting" | "bought" | "dropped";
  bought_price: number | null;
  bought_at: string | null; // YYYY-MM-DD
}

export type Verdict =
  | { kind: "fits" }
  | { kind: "next-month" }
  | { kind: "save"; months: number }
  | { kind: "unpriced" };

export interface CapStatus {
  month: string; // YYYY-MM
  cap: number;
  spent: number;
  remaining: number;
}

/** The price the verdict is judged on: the target (deal) price if set, else list. */
export function judgedPrice(w: Pick<WishLike, "price" | "target_price">): number | null {
  return w.target_price ?? w.price ?? null;
}

export function capStatus(items: WishLike[], cap: number, month: string): CapStatus {
  const spent = items
    .filter((i) => i.status === "bought" && i.bought_at?.startsWith(month))
    .reduce((acc, i) => acc + (i.bought_price ?? i.price ?? 0), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { month, cap, spent: round(spent), remaining: round(Math.max(0, cap - spent)) };
}

export function verdictFor(item: WishLike, status: CapStatus): Verdict {
  const p = judgedPrice(item);
  if (p == null) return { kind: "unpriced" };
  if (p <= status.remaining) return { kind: "fits" };
  if (status.cap > 0 && p <= status.cap) return { kind: "next-month" };
  if (status.cap <= 0) return { kind: "save", months: Infinity };
  return { kind: "save", months: Math.ceil(p / status.cap) };
}

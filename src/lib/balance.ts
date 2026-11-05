/**
 * The balance to show / count for an account.
 *
 * Checking and savings use the bank's AVAILABLE balance when Plaid has one —
 * that's the number the bank's own app shows and what you can actually spend.
 * The "current" (posted/ledger) balance can lag behind pending deposits:
 * e.g. BofA reported current $4.44 while available was $64.49.
 * Everything else (cards, loans, investments) keeps the current balance.
 */
export function effectiveBalance(a: {
  type?: string | null;
  current_balance?: unknown;
  available_balance?: unknown;
}): number {
  const toNum = (v: unknown): number | null => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const current = toNum(a.current_balance);
  if ((a.type ?? "").toLowerCase() === "depository") {
    const available = toNum(a.available_balance);
    if (available != null) return available;
  }
  return current ?? 0;
}

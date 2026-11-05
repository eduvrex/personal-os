import "server-only";

import { effectiveBalance } from "@/lib/balance";
import { db, USER_ID } from "@/lib/db";
import { localDateKey } from "@/lib/localDate";
import { loadOverrides, matchKey } from "@/lib/spending";
import type {
  BudgetDTO,
  CreditCardDTO,
  FinanceAccountDTO,
  FinanceOverviewDTO,
  LockedFinanceOverviewDTO,
  PlaidItemHealthDTO,
  SpendCategoryDTO,
} from "@/lib/types";

const ASSET_TYPES = new Set(["depository", "investment", "brokerage"]);

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (Date.parse(`${toKey}T00:00:00`) - Date.parse(`${fromKey}T00:00:00`)) /
      86_400_000,
  );
}

/** Days in a month, so a due_day of 31 clamps instead of rolling into next month. */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dueFromDay(today: string, dueDay: number): string {
  const [y, m] = today.split("-").map(Number);
  const day = (yy: number, mm: number) =>
    `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(dueDay, lastDayOfMonth(yy, mm))).padStart(2, "0")}`;
  const candidate = day(y, m);
  if (daysBetween(today, candidate) >= 0) return candidate;
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return day(ny, nm);
}

/**
 * Resolve a card's next due date + "due soon" flag from next_due_date or
 * due_day. A stale next_due_date (already past — common between syncs) falls
 * back to the recurring due_day, or is hidden rather than shown as a date
 * that already happened.
 */
export function resolveDue(
  today: string,
  nextDueDate: string | null,
  dueDay: number | null,
): { dueSoon: boolean; dueLabel: string | null } {
  let target =
    nextDueDate && daysBetween(today, nextDueDate) >= 0 ? nextDueDate : null;
  if (!target && dueDay) target = dueFromDay(today, dueDay);
  if (!target) return { dueSoon: false, dueLabel: null };
  const days = daysBetween(today, target);
  return { dueSoon: days >= 0 && days <= 5, dueLabel: target };
}

const DEBT_ACCOUNT_TYPES = new Set(["loan", "credit"]);

/**
 * Debt privacy screen: allowlist-copy ONLY the safe fields. Never spread the
 * full DTO here — a new debt field must be consciously added to survive.
 */
export function redactFinanceOverview(
  full: FinanceOverviewDTO,
): LockedFinanceOverviewDTO {
  return {
    locked: true,
    connected: full.connected,
    assets: full.assets,
    accounts: full.accounts.filter(
      (a) => !DEBT_ACCOUNT_TYPES.has((a.type ?? "").toLowerCase()),
    ),
    // Connection health carries no balances — safe to surface while locked so
    // a broken login can still be fixed.
    items: full.items,
    spending: full.spending,
    budgets: full.budgets,
  };
}

/** Pure net-worth math: assets − (card debt + loan debt). Exported for tests. */
export function financeTotals(
  accountRows: {
    type?: string | null;
    current_balance?: unknown;
    available_balance?: unknown;
  }[],
  cardRows: { balance?: unknown }[],
): { assets: number; loanDebt: number; cardDebt: number; debts: number; netWorth: number } {
  const assets = accountRows
    .filter((a) => ASSET_TYPES.has((a.type ?? "").toLowerCase()))
    .reduce((s, a) => s + effectiveBalance(a), 0);
  const loanDebt = accountRows
    .filter((a) => (a.type ?? "").toLowerCase() === "loan")
    .reduce((s, a) => s + num(a.current_balance), 0);
  const cardDebt = cardRows.reduce((s, c) => s + num(c.balance), 0);
  const debts = cardDebt + loanDebt;
  return { assets, loanDebt, cardDebt, debts, netWorth: assets - debts };
}

export async function buildFinanceOverview(): Promise<FinanceOverviewDTO> {
  const today = localDateKey();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [itemsRes, accountsRes, cardsRes, txnsRes, budgetsRes, overrides] =
    await Promise.all([
      db()
        .from("plaid_items")
        .select("id,institution_name,status")
        .eq("user_id", USER_ID),
      db()
        .from("finance_accounts")
        .select("*")
        .eq("user_id", USER_ID)
        .order("type", { ascending: true }),
      db()
        .from("credit_cards")
        .select("*")
        .eq("user_id", USER_ID)
        .order("balance", { ascending: false }),
      db()
        .from("transactions")
        .select("amount,category,date,name,merchant_name")
        .eq("user_id", USER_ID)
        .gte("date", monthStart),
      db().from("budgets").select("category,monthly_limit").eq("user_id", USER_ID),
      loadOverrides(),
    ]);

  for (const r of [itemsRes, accountsRes, cardsRes, txnsRes, budgetsRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const accountRows = accountsRes.data ?? [];
  const cardRows = cardsRes.data ?? [];

  const items: PlaidItemHealthDTO[] = (itemsRes.data ?? []).map((i) => {
    const status = (i.status as string) ?? "active";
    return {
      id: String(i.id),
      institution: (i.institution_name as string) ?? null,
      status,
      needsReconnect: status !== "active",
      accounts: accountRows
        .filter((a) => a.plaid_item_id === i.id)
        .map((a) => `${a.name}${a.mask ? ` ··${a.mask}` : ""}`),
    };
  });

  const accounts: FinanceAccountDTO[] = accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    mask: a.mask,
    current_balance: a.current_balance,
    available_balance: a.available_balance,
    credit_limit: a.credit_limit,
    source: a.source,
  }));

  const { assets, loanDebt, cardDebt, debts, netWorth } = financeTotals(accountRows, cardRows);

  const cards: CreditCardDTO[] = cardRows.map((c) => {
    const limit = c.credit_limit != null ? num(c.credit_limit) : null;
    const balance = c.balance != null ? num(c.balance) : null;
    const utilization =
      limit && limit > 0 && balance != null ? balance / limit : null;
    const { dueSoon, dueLabel } = resolveDue(today, c.next_due_date, c.due_day);
    return {
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      balance,
      credit_limit: limit,
      minimum_payment: c.minimum_payment != null ? num(c.minimum_payment) : null,
      due_day: c.due_day,
      next_due_date: c.next_due_date,
      apr: c.apr != null ? num(c.apr) : null,
      source: c.source,
      utilization,
      overLimit: limit != null && balance != null && balance > limit,
      dueSoon,
      dueLabel,
    };
  });

  // Spending: this month, grouped by category (Plaid: positive amount = outflow).
  const budgets: BudgetDTO[] = (budgetsRes.data ?? []).map((b) => ({
    category: b.category,
    monthly_limit: num(b.monthly_limit),
  }));
  const budgetByCategory = new Map(budgets.map((b) => [b.category, b.monthly_limit]));

  const spendByCategory = new Map<string, number>();
  let total = 0;
  for (const t of txnsRes.data ?? []) {
    const amt = num(t.amount);
    if (amt <= 0) continue; // skip income/refunds
    // Same effective category as the Spending tab: operator override wins.
    const cat =
      overrides.get(matchKey(t.merchant_name ?? null, t.name ?? null)) ??
      (t.category as string | null) ??
      "Uncategorized";
    spendByCategory.set(cat, (spendByCategory.get(cat) ?? 0) + amt);
    total += amt;
  }
  // Include budgeted categories even with zero spend so alerts/limits show.
  for (const b of budgets) {
    if (!spendByCategory.has(b.category)) spendByCategory.set(b.category, 0);
  }

  const categories: SpendCategoryDTO[] = [...spendByCategory.entries()]
    .map(([category, spent]) => {
      const budget = budgetByCategory.get(category) ?? null;
      return { category, spent, budget, over: budget != null && spent > budget };
    })
    .sort((a, b) => b.spent - a.spent);

  return {
    connected: items.length > 0,
    netWorth,
    assets,
    debts,
    cardDebt,
    loanDebt,
    accounts,
    cards,
    items,
    spending: { month: today.slice(0, 7), total, categories },
    budgets,
  };
}

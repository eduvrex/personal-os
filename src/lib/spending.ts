import "server-only";

import { db, USER_ID } from "@/lib/db";
import { localDateKey } from "@/lib/localDate";
import type {
  SpendingInsightDTO,
  SpendingResponseDTO,
  TransactionDTO,
} from "@/lib/types";

/**
 * W3 — Spending: transaction list with effective categories (Plaid category
 * unless the operator re-categorized that merchant), monthly summaries with a
 * last-month trend, budget-vs-actual, and deterministic insights. No LLM here.
 */

/**
 * Normalized merchant key so one override re-categorizes every transaction
 * from the same merchant: lowercase, strip store numbers/punctuation/extra
 * whitespace. "STARBUCKS #1234" and "Starbucks 0987" → "starbucks".
 */
export function matchKey(merchant: string | null, name: string | null): string {
  const base = (merchant || name || "").toLowerCase();
  return base
    .replace(/[#*]?\d{3,}/g, " ") // store / reference numbers
    .replace(/[^a-z&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Human display name from raw bank descriptors:
 * "PAYPAL DES:PURCHASE ID:PARAMNTPLUS INDN:JANE DOE CO ID:XXX WEB"
 * → "PayPal · Paramntplus". Falls back to a tidied title-case of the raw name.
 */
export function cleanName(merchant: string | null, name: string | null): string {
  const raw = (merchant || name || "").trim();
  if (!raw) return "—";
  // ACH descriptor pattern: pull the counterparty + the ID token.
  const des = raw.match(/^([A-Za-z .&']+?)\s+DES:/);
  const id = raw.match(/\bID:([A-Za-z][\w.-]*)/);
  if (des && id) return `${titleCase(des[1])} · ${titleCase(id[1])}`;
  // Strip descriptor noise and trailing ACH codes.
  const cleaned = raw
    .replace(/\b(?:DES|ID|INDN|CO ID):\S*/gi, " ")
    .replace(/\b(?:WEB|PPD|CCD|POS|ACH)\b\s*$/i, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return titleCase(cleaned || raw);
}

function titleCase(s: string): string {
  const lower = s.toLowerCase();
  // Keep short all-caps tokens (e.g. "AMC") readable but avoid shouting names.
  return lower.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPaypal\b/g, "PayPal");
}

interface TxnRow {
  id: string;
  date: string | null;
  name: string | null;
  merchant_name: string | null;
  amount: unknown;
  category: string | null;
  pending: boolean | null;
  plaid_account_id: string | null;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

/** Overrides map; resilient — an absent table (migration pending) reads as none. */
export async function loadOverrides(): Promise<Map<string, string>> {
  try {
    const { data, error } = await db()
      .from("category_overrides")
      .select("match_key,category")
      .eq("user_id", USER_ID);
    if (error) return new Map();
    return new Map((data ?? []).map((r) => [String(r.match_key), String(r.category)]));
  } catch {
    return new Map();
  }
}

export async function setCategoryOverride(
  key: string,
  category: string | null,
): Promise<void> {
  if (category === null) {
    const { error } = await db()
      .from("category_overrides")
      .delete()
      .eq("user_id", USER_ID)
      .eq("match_key", key);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await db()
    .from("category_overrides")
    .upsert(
      { user_id: USER_ID, match_key: key, category },
      { onConflict: "user_id,match_key" },
    );
  if (error) throw new Error(error.message);
}

function monthOf(date: string | null): string {
  return (date ?? "").slice(0, 7);
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function effectiveCategory(t: TxnRow, overrides: Map<string, string>): string {
  return (
    overrides.get(matchKey(t.merchant_name, t.name)) ??
    t.category ??
    "UNCATEGORIZED"
  );
}

function toDTO(
  t: TxnRow,
  overrides: Map<string, string>,
  accountNames: Map<string, string>,
): TransactionDTO {
  const key = matchKey(t.merchant_name, t.name);
  return {
    id: t.id,
    date: t.date,
    name: cleanName(t.merchant_name, t.name),
    amount: num(t.amount),
    category: effectiveCategory(t, overrides),
    rawCategory: t.category,
    overridden: overrides.has(key),
    matchKey: key,
    pending: Boolean(t.pending),
    account: t.plaid_account_id
      ? (accountNames.get(t.plaid_account_id) ?? null)
      : null,
  };
}

/** Deterministic insights — neutral information, never instructions. */
export function computeInsights(
  txns: TransactionDTO[],
  month: string,
): SpendingInsightDTO[] {
  const insights: SpendingInsightDTO[] = [];
  const monthTxns = txns.filter((t) => monthOf(t.date) === month && t.amount > 0);

  // Top categories this month.
  const byCat = new Map<string, number>();
  for (const t of monthTxns) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length > 0) {
    insights.push({
      kind: "top_categories",
      title: "Where the money went",
      detail: top
        .map(([c, v]) => `${humanCategory(c)} $${Math.round(v)}`)
        .join(" · "),
    });
  }

  // Possible subscriptions: same merchant, near-equal amount, ≥2 distinct months.
  const byMerchant = new Map<string, TransactionDTO[]>();
  for (const t of txns.filter((x) => x.amount > 0)) {
    if (!t.matchKey) continue;
    byMerchant.set(t.matchKey, [...(byMerchant.get(t.matchKey) ?? []), t]);
  }
  const subs: string[] = [];
  for (const [, list] of byMerchant) {
    const months = new Set(list.map((t) => monthOf(t.date)));
    if (months.size < 2) continue;
    const amounts = list.map((t) => t.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (max - min <= Math.max(1, min * 0.05)) {
      subs.push(`${list[0].name} (~$${amounts[0].toFixed(2)}/mo)`);
    }
  }
  if (subs.length > 0) {
    insights.push({
      kind: "subscriptions",
      title: "Looks like recurring charges",
      detail: subs.slice(0, 6).join(" · "),
    });
  }

  // Unusually large charges this month: > 3× the overall median, min $50.
  const all = txns.filter((t) => t.amount > 0).map((t) => t.amount).sort((a, b) => a - b);
  if (all.length >= 8) {
    const median = all[Math.floor(all.length / 2)];
    const big = monthTxns
      .filter((t) => t.amount >= Math.max(50, median * 3))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);
    if (big.length > 0) {
      insights.push({
        kind: "large_charges",
        title: "Larger than your usual",
        detail: big.map((t) => `${t.name} $${t.amount.toFixed(2)}`).join(" · "),
      });
    }
  }

  return insights;
}

export function humanCategory(c: string): string {
  return c.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Everything the Spending view needs, in one round trip. */
export async function buildSpending(month?: string): Promise<SpendingResponseDTO> {
  const target = month && /^\d{4}-\d{2}$/.test(month) ? month : localDateKey().slice(0, 7);
  const prior = prevMonth(target);

  const [txRes, acctRes, budgetRes, overrides] = await Promise.all([
    db()
      .from("transactions")
      .select("id,date,name,merchant_name,amount,category,pending,plaid_account_id")
      .eq("user_id", USER_ID)
      .order("date", { ascending: false })
      .limit(2000),
    db().from("finance_accounts").select("plaid_account_id,name,mask").eq("user_id", USER_ID),
    db().from("budgets").select("category,monthly_limit").eq("user_id", USER_ID),
    loadOverrides(),
  ]);
  if (txRes.error) throw new Error(txRes.error.message);

  const accountNames = new Map<string, string>();
  for (const a of acctRes.data ?? []) {
    if (a.plaid_account_id) {
      accountNames.set(
        String(a.plaid_account_id),
        `${a.name}${a.mask ? ` ••${a.mask}` : ""}`,
      );
    }
  }

  const all = ((txRes.data ?? []) as TxnRow[]).map((t) =>
    toDTO(t, overrides, accountNames),
  );

  const inMonth = all.filter((t) => monthOf(t.date) === target);
  const spentBy = (list: TransactionDTO[]) => {
    const m = new Map<string, number>();
    for (const t of list) {
      if (t.amount <= 0) continue;
      m.set(t.category, (m.get(t.category) ?? 0) + t.amount);
    }
    return m;
  };
  const current = spentBy(inMonth);
  const previous = spentBy(all.filter((t) => monthOf(t.date) === prior));

  const budgets = new Map(
    (budgetRes.data ?? []).map((b) => [String(b.category), num(b.monthly_limit)]),
  );
  const categoryNames = new Set([...current.keys(), ...budgets.keys()]);
  const categories = [...categoryNames]
    .map((c) => {
      const spent = current.get(c) ?? 0;
      const budget = budgets.get(c) ?? null;
      const last = previous.get(c) ?? 0;
      return {
        category: c,
        label: humanCategory(c),
        spent,
        lastMonth: last,
        budget,
        over: budget != null && spent > budget,
      };
    })
    .sort((a, b) => b.spent - a.spent);

  const total = [...current.values()].reduce((s, v) => s + v, 0);
  const lastTotal = [...previous.values()].reduce((s, v) => s + v, 0);

  const months = [...new Set(all.map((t) => monthOf(t.date)).filter(Boolean))]
    .sort()
    .reverse();

  // A fresh month starts empty — without an explicit request, show the newest
  // month that actually has data.
  if (!month && inMonth.length === 0 && months[0] && months[0] !== target) {
    return buildSpending(months[0]);
  }

  return {
    month: target,
    months,
    total,
    lastMonthTotal: lastTotal,
    categories,
    transactions: inMonth,
    insights: computeInsights(all, target),
  };
}

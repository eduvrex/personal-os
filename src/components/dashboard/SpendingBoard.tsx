"use client";

import { useCallback, useEffect, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON } from "@/lib/api";
import type {
  SpendingCategorySummaryDTO,
  SpendingInsightDTO,
  SpendingResponseDTO,
  TransactionDTO,
} from "@/lib/types";

function currency(n: number | null | undefined, dp = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function SpendingBoard() {
  const [data, setData] = useState<SpendingResponseDTO | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (m?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const q = m ? `?month=${m}` : "";
      const r = await fetch(`/api/spending${q}`);
      if (!r.ok) throw new Error(`spending request failed (${r.status})`);
      const d = (await r.json()) as SpendingResponseDTO;
      setData(d);
      setMonth(d.month);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel title="Spending">
          <EmptyState>Loading…</EmptyState>
        </Panel>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel title="Spending">
          <ErrorNote message={error} onRetry={() => load(month)} />
        </Panel>
      </div>
    );
  }
  if (!data) return null;

  const idx = data.months.indexOf(data.month);
  const newer = idx > 0 ? data.months[idx - 1] : null;
  const older = idx >= 0 && idx < data.months.length - 1 ? data.months[idx + 1] : null;
  const delta = data.lastMonthTotal > 0 ? data.total - data.lastMonthTotal : null;
  // lastMonthTotal is the previous *calendar* month (see lib/spending.ts) —
  // label it as such, not as the previous month that happens to have data.
  const [py, pm] = data.month.split("-").map(Number);
  const priorMonth = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, "0")}`;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Panel
        title="Spending"
        meta={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => older && load(older)}
              disabled={!older}
              aria-label="Older month"
              className="rounded-[3px] border border-white/[0.08] px-2 py-1 text-xs text-ink-3 hover:border-ember/30 hover:text-ember disabled:opacity-30"
            >
              ←
            </button>
            <span className="min-w-28 text-center text-xs text-ink-4">
              {monthLabel(data.month)}
            </span>
            <button
              type="button"
              onClick={() => newer && load(newer)}
              disabled={!newer}
              aria-label="Newer month"
              className="rounded-[3px] border border-white/[0.08] px-2 py-1 text-xs text-ink-3 hover:border-ember/30 hover:text-ember disabled:opacity-30"
            >
              →
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-3xl tracking-tight text-ink-4">
            <CountUp value={data.total} format={(n) => currency(n, 0)} />
          </span>
          {delta != null ? (
            <span className={`text-xs ${delta > 0 ? "text-warn" : "text-ok"}`}>
              {delta > 0 ? "▲" : "▼"} {currency(Math.abs(delta), 0)} vs{" "}
              {monthLabel(priorMonth)}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-ink-3">
          Across your bank and cards. Click a category on any transaction to
          re-categorize — it remembers the merchant.
        </p>
      </Panel>

      {data.insights.length > 0 ? <InsightsPanel insights={data.insights} /> : null}

      <CategoriesPanel categories={data.categories} onChanged={() => load(data.month)} />

      <TransactionsPanel
        transactions={data.transactions}
        knownCategories={data.categories.map((c) => c.category)}
        onChanged={() => load(data.month)}
      />
    </div>
  );
}

function InsightsPanel({ insights }: { insights: SpendingInsightDTO[] }) {
  return (
    <Panel title="Noticed this" meta="neutral info — you decide">
      <div className="flex flex-col gap-2.5">
        {insights.map((i) => (
          <div
            key={i.kind}
            className="rounded-[3px] border border-white/[0.05] bg-white/[0.02] p-3"
          >
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">
              {i.title}
            </div>
            <div className="text-sm leading-relaxed text-ink-4">{i.detail}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CategoriesPanel({
  categories,
  onChanged,
}: {
  categories: SpendingCategorySummaryDTO[];
  onChanged: () => void;
}) {
  if (categories.length === 0) {
    return (
      <Panel title="By category">
        <EmptyState>No spending this month yet.</EmptyState>
      </Panel>
    );
  }
  const max = Math.max(...categories.map((c) => Math.max(c.spent, c.budget ?? 0)), 1);

  return (
    <Panel title="By category" meta="budget vs actual">
      <ul className="flex flex-col">
        {categories.map((c) => (
          <CategoryRow key={c.category} cat={c} max={max} onChanged={onChanged} />
        ))}
      </ul>
    </Panel>
  );
}

function CategoryRow({
  cat,
  max,
  onChanged,
}: {
  cat: SpendingCategorySummaryDTO;
  max: number;
  onChanged: () => void;
}) {
  const [budget, setBudget] = useState(cat.budget != null ? String(cat.budget) : "");
  const width = Math.max(2, (cat.spent / max) * 100);
  const overBudget = cat.over;
  const trend = cat.lastMonth > 0 ? cat.spent - cat.lastMonth : null;

  async function saveBudget() {
    const current = cat.budget != null ? String(cat.budget) : "";
    if (budget === current) return;
    await sendJSON("/api/budgets", "POST", {
      category: cat.category,
      monthly_limit: Math.max(0, parseFloat(budget) || 0),
    });
    onChanged();
  }

  return (
    <li className="border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm text-ink-4">{cat.label}</span>
        <span className={`font-mono text-sm ${overBudget ? "text-danger" : "text-ink-4"}`}>
          {currency(cat.spent, 0)}
          {cat.budget != null ? (
            <span className="text-ink-3"> / {currency(cat.budget, 0)}</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full ${overBudget ? "bg-danger" : "bg-ember"}`}
          style={{ width: `${Math.min(100, width)}%` }}
        />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        {trend != null ? (
          <span>
            {trend >= 0 ? "▲" : "▼"} {currency(Math.abs(trend), 0)} vs last month
          </span>
        ) : (
          <span>new this month</span>
        )}
        <span className="flex items-center gap-1.5">
          Budget
          <input
            type="number"
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            onBlur={saveBudget}
            placeholder="—"
            aria-label={`Monthly budget for ${cat.label}`}
            className="w-20 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-ink-4 focus:border-ember/30 focus:outline-none"
          />
        </span>
        {overBudget ? (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
            Over budget
          </span>
        ) : null}
      </div>
    </li>
  );
}

function TransactionsPanel({
  transactions,
  knownCategories,
  onChanged,
}: {
  transactions: TransactionDTO[];
  knownCategories: string[];
  onChanged: () => void;
}) {
  if (transactions.length === 0) {
    return (
      <Panel title="Transactions">
        <EmptyState>Nothing this month — sync from the Finance tab.</EmptyState>
      </Panel>
    );
  }

  // Group by date, newest first (list arrives sorted).
  const groups: { date: string; items: TransactionDTO[] }[] = [];
  for (const t of transactions) {
    const d = t.date ?? "—";
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.items.push(t);
    else groups.push({ date: d, items: [t] });
  }

  return (
    <Panel title="Transactions" meta={`${transactions.length}`}>
      <div className="flex flex-col gap-3">
        {groups.map((g) => (
          <div key={g.date}>
            <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">
              {g.date === "—"
                ? "Undated"
                : new Date(`${g.date}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
            </div>
            <ul className="flex flex-col">
              {g.items.map((t) => (
                <TransactionRow
                  key={t.id}
                  txn={t}
                  knownCategories={knownCategories}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TransactionRow({
  txn,
  knownCategories,
  onChanged,
}: {
  txn: TransactionDTO;
  knownCategories: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(category: string | null) {
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/spending/override", "POST", {
        matchKey: txn.matchKey,
        category,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const label = txn.category.toLowerCase().replace(/_/g, " ");

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.05] py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink-4">
          {txn.name}
          {txn.pending ? (
            <span className="ml-1.5 rounded bg-white/[0.06] px-1 py-0.5 text-[9px] uppercase tracking-wide text-ink-3">
              pending
            </span>
          ) : null}
        </div>
        {txn.account ? (
          <div className="truncate text-[11px] text-ink-3">{txn.account}</div>
        ) : null}
      </div>

      {editing ? (
        <span className="flex items-center gap-1.5">
          <input
            list="pos-categories"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply(value.trim() || null);
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={label}
            autoFocus
            aria-label={`Category for ${txn.name}`}
            className="w-36 rounded border border-ember/30 bg-white/[0.03] px-2 py-1 text-xs text-ink-4 focus:outline-none"
          />
          <datalist id="pos-categories">
            {knownCategories.map((c) => (
              <option key={c} value={c.toLowerCase().replace(/_/g, " ")} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={() => apply(value.trim() || null)}
            disabled={busy}
            className="rounded bg-ember/10 px-2 py-1 text-xs text-ember hover:bg-ember/20 disabled:opacity-50"
          >
            {busy ? "…" : "Save"}
          </button>
          {txn.overridden ? (
            <button
              type="button"
              onClick={() => apply(null)}
              disabled={busy}
              title="Back to Plaid's category"
              className="rounded px-1.5 py-1 text-xs text-ink-3 hover:text-danger"
            >
              Reset
            </button>
          ) : null}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setValue("");
            setEditing(true);
          }}
          title="Re-categorize (remembers this merchant)"
          className={`rounded px-2 py-0.5 text-[11px] capitalize transition-colors ${
            txn.overridden
              ? "bg-ember/10 text-ember hover:bg-ember/20"
              : "bg-white/[0.05] text-ink-3 hover:text-ember"
          }`}
        >
          {label}
          {txn.overridden ? " ✎" : ""}
        </button>
      )}

      <span
        className={`w-20 text-right font-mono text-sm ${
          txn.amount < 0 ? "text-ok" : "text-ink-4"
        }`}
      >
        {txn.amount < 0 ? "+" : ""}
        {currency(Math.abs(txn.amount))}
      </span>
      {error ? <span className="w-full text-[11px] text-danger">{error}</span> : null}
    </li>
  );
}

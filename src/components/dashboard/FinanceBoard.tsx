"use client";

import { useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

import { Panel } from "@/components/ui/Panel";
import { CountUp } from "@/components/ui/CountUp";
import { AdvisorPanel } from "@/components/dashboard/AdvisorPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";
import { effectiveBalance } from "@/lib/balance";
import type {
  CreditCardDTO,
  FinanceAccountDTO,
  FinanceOverviewDTO,
  FinanceOverviewResponse,
  PlaidItemHealthDTO,
  SpendCategoryDTO,
} from "@/lib/types";

function currency(n: number | null | undefined, dp = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function shortDate(key: string | null): string {
  if (!key) return "—";
  return new Date(`${key}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function FinanceBoard() {
  const { data, loading, error, reload } =
    useResource<FinanceOverviewResponse>("/api/finance/overview");

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel title="Finance">
          <EmptyState>Loading…</EmptyState>
        </Panel>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel title="Finance">
          <ErrorNote message={error} onRetry={reload} />
        </Panel>
      </div>
    );
  }

  const o = data ?? null;
  const full: FinanceOverviewDTO | null = o && !o.locked ? o : null;
  const locked = !!o?.locked;
  const connected = o?.connected ?? false;
  const hasAnything =
    connected || (o?.accounts.length ?? 0) > 0 || (full?.cards.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <NetWorthPanel overview={o} full={full} onChanged={reload} />

      {o?.items.some((i) => i.needsReconnect) ? (
        <ReconnectPanel
          items={o.items.filter((i) => i.needsReconnect)}
          onChanged={reload}
        />
      ) : null}

      {locked ? <DebtLockPanel onUnlocked={reload} /> : null}

      {!hasAnything ? (
        <Panel title="Get started">
          <EmptyState>
            Connect a bank or card account to see balances, spending, and net
            worth.
          </EmptyState>
        </Panel>
      ) : null}

      {full && full.cards.length > 0 ? <CardsPanel cards={full.cards} /> : null}
      {o && o.accounts.length > 0 ? <AccountsPanel accounts={o.accounts} /> : null}
      {o && o.items.length > 0 ? (
        <ConnectionsPanel items={o.items} onChanged={reload} />
      ) : null}
      {o ? <SpendingPanel spending={o.spending} onChanged={reload} /> : null}

      <AdvisorPanel locked={locked} />
    </div>
  );
}

function NetWorthPanel({
  overview,
  full,
  onChanged,
}: {
  overview: FinanceOverviewResponse | null;
  full: FinanceOverviewDTO | null;
  onChanged: () => void;
}) {
  const [locking, setLocking] = useState(false);

  async function lock() {
    setLocking(true);
    try {
      await sendJSON("/api/finance/unlock", "DELETE");
      onChanged();
    } finally {
      setLocking(false);
    }
  }

  return (
    <Panel
      title={full ? "Net Worth" : "Cash & Savings"}
      meta={
        <div className="flex items-center gap-2">
          {full ? (
            <button
              type="button"
              onClick={lock}
              disabled={locking}
              className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/30 hover:text-ember disabled:opacity-50"
            >
              🔒 Lock debt
            </button>
          ) : null}
          <SyncButton onDone={onChanged} />
          <ConnectButton onConnected={onChanged} />
        </div>
      }
    >
      <div className="font-mono text-3xl tracking-tight text-ink-4">
        {(full ? full.netWorth : overview?.assets) != null ? (
          <CountUp
            value={(full ? full.netWorth : overview?.assets) as number}
            format={(n) => currency(n)}
          />
        ) : (
          "—"
        )}
      </div>
      {full ? (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
          <span>
            Assets <span className="font-mono text-ok">{currency(full.assets)}</span>
          </span>
          <span>
            Debts <span className="font-mono text-danger">−{currency(full.debts)}</span>
          </span>
          {full.cardDebt ? (
            <span>
              Cards <span className="font-mono text-ink-4">{currency(full.cardDebt)}</span>
            </span>
          ) : null}
          {full.loanDebt ? (
            <span>
              Loans <span className="font-mono text-ink-4">{currency(full.loanDebt)}</span>
            </span>
          ) : null}
        </div>
      ) : (
        <div className="mt-1 text-xs text-ink-3">
          Bank &amp; investment balances. Net worth and debt are behind the
          privacy screen below.
        </div>
      )}
    </Panel>
  );
}

/** PIN prompt for the debt privacy screen. */
function DebtLockPanel({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!pin.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/finance/unlock", "POST", { pin: pin.trim() });
      setPin("");
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Debt · Locked" meta={<span aria-hidden>🔒</span>}>
      <p className="-mt-1 mb-3 text-xs text-ink-3">
        Cards, balances, APRs, and totals are hidden from view. This is a
        privacy screen for shoulder-surfing — the data itself stays protected
        by your login either way. Unlocks for 30 minutes, this browser only.
      </p>
      <form onSubmit={unlock} className="flex items-center gap-2">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          aria-label="Finance PIN"
          className="w-32 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !pin.trim()}
          className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          {busy ? "…" : "Unlock"}
        </button>
        {error ? <span className="text-xs text-danger">{error}</span> : null}
      </form>
    </Panel>
  );
}

/**
 * Plaid Link launcher, shared by "Connect account" (new item) and per-item
 * "Reconnect" (update mode — pass itemId). Update mode re-authenticates the
 * stored token, so there is no public token to exchange; both modes end with
 * a sync so fresh data appears immediately.
 */
function PlaidLinkButton({
  itemId,
  kind,
  label,
  onDone,
}: {
  itemId?: string;
  /** New connections only: "bank" shows checking/savings, "card" shows cards. */
  kind?: "bank" | "card";
  label: string;
  onDone: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { open, ready } = usePlaidLink({
    token,
    onSuccess: async (publicToken) => {
      setBusy(true);
      try {
        if (!itemId) {
          await sendJSON("/api/plaid/exchange", "POST", {
            public_token: publicToken,
          });
        }
        await sendJSON("/api/plaid/sync", "POST");
        onDone();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Connecting the account failed.");
      } finally {
        setBusy(false);
        setToken(null);
      }
    },
    onExit: (err, metadata) => {
      setToken(null);
      // Surface Plaid's reason instead of silently closing — otherwise a bank
      // that "doesn't work" gives no clue why.
      if (err) {
        const bank = metadata?.institution?.name ?? "The bank";
        alert(
          `${bank}: ${err.display_message || err.error_message} (${err.error_code})`,
        );
      }
    },
  });

  useEffect(() => {
    if (token && ready) open();
  }, [token, ready, open]);

  async function start() {
    setBusy(true);
    try {
      const res = await sendJSON<{ link_token: string }>(
        "/api/plaid/link-token",
        "POST",
        itemId ? { item_id: itemId } : kind ? { kind } : undefined,
      );
      setToken(res.link_token);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't start Plaid Link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
    >
      {busy ? "…" : label}
    </button>
  );
}

/**
 * Two entry points so banks that hold both kinds under one login (Capital One)
 * get each connected properly: "Connect bank" only offers checking/savings,
 * "Connect card" only offers credit cards and requires at least one.
 */
function ConnectButton({ onConnected }: { onConnected: () => void }) {
  return (
    <>
      <PlaidLinkButton kind="bank" label="Connect bank" onDone={onConnected} />
      <PlaidLinkButton kind="card" label="Connect card" onDone={onConnected} />
    </>
  );
}

/**
 * Every connected login, with the accounts it shares. "Edit accounts" reopens
 * Plaid's account picker (to add a card that was left out); "Remove" drops a
 * login entirely — for duplicates.
 */
function ConnectionsPanel({
  items,
  onChanged,
}: {
  items: PlaidItemHealthDTO[];
  onChanged: () => void;
}) {
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(i: PlaidItemHealthDTO) {
    const what = i.accounts.length ? i.accounts.join(", ") : "no accounts";
    if (
      !confirm(
        `Remove this ${i.institution ?? "bank"} connection (${what})?\n\nIts accounts and transaction history will be deleted from Personal OS. Your actual bank account is not affected.`,
      )
    ) {
      return;
    }
    setRemoving(i.id);
    try {
      await sendJSON("/api/plaid/remove", "POST", { item_id: i.id });
      onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't remove the connection.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Panel title="Connections">
      <ul className="flex flex-col">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-2 border-t border-white/[0.05] py-2.5 first:border-t-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-ink-4">
                {i.institution ?? "Connected bank"}
                {i.needsReconnect ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-warn">
                    needs reconnect
                  </span>
                ) : null}
              </div>
              <div className="truncate text-[11px] text-ink-3">
                {i.accounts.length ? i.accounts.join(" · ") : "No accounts shared"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PlaidLinkButton itemId={i.id} label="Edit accounts" onDone={onChanged} />
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={removing === i.id}
                className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
              >
                {removing === i.id ? "…" : "Remove"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Banner listing bank logins that broke (password change, expired consent). */
function ReconnectPanel({
  items,
  onChanged,
}: {
  items: PlaidItemHealthDTO[];
  onChanged: () => void;
}) {
  return (
    <Panel title="Connection needs attention" meta={<span aria-hidden>⚠️</span>}>
      <ul className="flex flex-col">
        {items.map((i) => (
          <li
            key={i.id}
            className="flex items-center justify-between gap-2 border-t border-white/[0.05] py-2.5 first:border-t-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-ink-4">
                {i.institution ?? "Connected bank"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-warn">
                {i.status === "login_required"
                  ? "Sign-in expired — reconnect to resume syncing"
                  : "Sync failing — reconnect to repair"}
              </div>
            </div>
            <PlaidLinkButton itemId={i.id} label="Reconnect" onDone={onChanged} />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SyncButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function sync() {
    setBusy(true);
    try {
      const res = await sendJSON<{ errors?: Record<string, string> }>(
        "/api/plaid/sync",
        "POST",
      );
      const errs = Object.entries(res?.errors ?? {});
      if (errs.length) {
        alert(errs.map(([bank, msg]) => `${bank}: ${msg}`).join("\n"));
      }
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={sync}
      disabled={busy}
      className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/30 hover:text-ember disabled:opacity-50"
    >
      {busy ? "Syncing…" : "Sync now"}
    </button>
  );
}

function CardsPanel({ cards }: { cards: CreditCardDTO[] }) {
  return (
    <Panel title="Credit Cards" meta={`${cards.length}`}>
      <div className="flex flex-col gap-3">
        {cards.map((c) => {
          const util = c.utilization ?? 0;
          const pct = Math.min(1, Math.max(0, util)) * 100;
          const barColor = c.overLimit
            ? "bg-danger"
            : util > 0.7
              ? "bg-warn"
              : "bg-ember";
          return (
            <div
              key={c.id}
              className={`rounded-[3px] border bg-white/[0.02] p-3 ${
                c.overLimit ? "border-danger/40" : "border-white/[0.06]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink-4">
                    {c.name}
                  </div>
                  {c.issuer ? (
                    <div className="truncate text-[11px] text-ink-3">{c.issuer}</div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-ink-4">
                    {currency(c.balance, 2)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-ink-3">
                    of {currency(c.credit_limit, 0)}
                  </div>
                </div>
              </div>

              {c.credit_limit ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
                {c.utilization != null ? (
                  <span>{Math.round(c.utilization * 100)}% used</span>
                ) : null}
                {c.minimum_payment != null ? (
                  <span>Min {currency(c.minimum_payment, 2)}</span>
                ) : null}
                {c.dueLabel ? (
                  <span className={c.dueSoon ? "font-medium text-warn" : ""}>
                    Due {shortDate(c.dueLabel)}
                  </span>
                ) : null}
                {c.apr != null ? <span>{c.apr}% APR</span> : null}
                {c.overLimit ? (
                  <span className="rounded bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
                    Over limit
                  </span>
                ) : null}
                {c.dueSoon ? (
                  <span className="rounded bg-warn/15 px-1.5 py-0.5 font-medium text-warn">
                    Due soon
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function AccountsPanel({ accounts }: { accounts: FinanceAccountDTO[] }) {
  // Cards are shown in their own panel; here show non-credit accounts.
  const banks = accounts.filter((a) => (a.type ?? "").toLowerCase() !== "credit");
  if (banks.length === 0) return null;
  return (
    <Panel title="Accounts" meta={`${banks.length}`}>
      <ul className="flex flex-col">
        {banks.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-2 border-t border-white/[0.05] py-2.5 first:border-t-0"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-ink-4">
                {a.name}
                {a.mask ? (
                  <span className="ml-1 text-[11px] text-ink-3">••{a.mask}</span>
                ) : null}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-ink-3">
                {a.subtype ?? a.type ?? "account"}
              </div>
            </div>
            <span className="text-right">
              <span className="block font-mono text-sm text-ink-4">
                {currency(effectiveBalance(a), 2)}
              </span>
              {effectiveBalance(a) !== (a.current_balance ?? 0) ? (
                <span className="block text-[10px] text-ink-3">
                  posted {currency(a.current_balance, 2)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function SpendingPanel({
  spending,
  onChanged,
}: {
  spending: { month: string; total: number; categories: SpendCategoryDTO[] };
  onChanged: () => void;
}) {
  const { categories, total } = spending;

  async function setBudget(category: string, value: string) {
    const monthly_limit = parseFloat(value);
    await sendJSON("/api/budgets", "POST", {
      category,
      monthly_limit: Number.isFinite(monthly_limit) ? monthly_limit : 0,
    });
    onChanged();
  }

  return (
    <Panel
      title="Spending · This Month"
      meta={
        <span className="flex items-center gap-2">
          <span>{currency(total, 0)}</span>
          <a href="/spending" className="text-ember hover:underline">details →</a>
        </span>
      }
    >
      {categories.length === 0 ? (
        <EmptyState>No transactions yet this month.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {categories.map((cat) => (
            <SpendRow key={cat.category} cat={cat} onSetBudget={setBudget} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SpendRow({
  cat,
  onSetBudget,
}: {
  cat: SpendCategoryDTO;
  onSetBudget: (category: string, value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(cat.budget != null ? String(cat.budget) : "");
  const pct =
    cat.budget && cat.budget > 0
      ? Math.min(1, cat.spent / cat.budget) * 100
      : null;

  return (
    <li className="border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm capitalize text-ink-4">
          {cat.category.toLowerCase().replace(/_/g, " ")}
        </span>
        <span
          className={`font-mono text-sm ${cat.over ? "text-danger" : "text-ink-4"}`}
        >
          {currency(cat.spent, 2)}
        </span>
      </div>

      {pct != null ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full ${cat.over ? "bg-danger" : "bg-ember"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
        <span>Budget</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (value !== (cat.budget != null ? String(cat.budget) : "")) {
              onSetBudget(cat.category, value);
            }
          }}
          placeholder="—"
          className="w-20 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-ink-4 focus:border-ember/30 focus:outline-none"
        />
        {cat.over ? (
          <span className="rounded bg-danger/15 px-1.5 py-0.5 font-medium text-danger">
            Over budget
          </span>
        ) : null}
      </div>
    </li>
  );
}

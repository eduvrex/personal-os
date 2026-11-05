"use client";

import Link from "next/link";

import { Panel } from "@/components/ui/Panel";
import { CountUp } from "@/components/ui/CountUp";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useResource } from "@/lib/api";
import type { FinanceOverviewResponse } from "@/lib/types";

function currency(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * This month's top spending categories as thin single-hue bars — length
 * carries the value; labels stay in ink tokens.
 */
function TopCategories({
  spending,
}: {
  spending: FinanceOverviewResponse["spending"];
}) {
  const top = [...spending.categories]
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 3);
  if (top.length === 0 || spending.total <= 0) return null;
  const max = top[0].spent;

  return (
    <div className="mt-3 border-t border-white/[0.05] pt-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-3">
        <span>Spent this month</span>
        <span className="font-mono">{currency(spending.total)}</span>
      </div>
      <div className="flex flex-col gap-2">
        {top.map((c) => (
          <div key={c.category} title={`${c.category}: ${currency(c.spent)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-3">{c.category}</span>
              <span className="font-mono text-[11px] text-ink-4">
                {currency(c.spent)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                  c.over ? "bg-danger/80" : "bg-ember/70"
                }`}
                style={{ width: `${Math.max(4, (c.spent / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Home card: assets at a glance. The debt side of net worth stays behind the
 * PIN privacy screen — unlock lives in the Finance tab.
 */
export function FinancePulse() {
  const { data, loading, error, reload } = useResource<FinanceOverviewResponse>(
    "/api/finance/overview",
  );
  const hasData = !!data && (data.connected || data.accounts.length > 0);
  const locked = !!data?.locked;

  return (
    <Panel title="Finance Pulse" meta={<Link href="/finance" className="hover:text-ember">Open →</Link>}>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && !hasData ? (
        <EmptyState>Connect an account in the Finance tab.</EmptyState>
      ) : locked ? (
        <>
          <div className="text-[10px] uppercase tracking-wider text-ink-3">
            Cash &amp; savings
          </div>
          <div className="font-mono text-3xl tracking-tight text-ink-4">
            {data?.assets != null ? (
              <CountUp value={data.assets} format={currency} />
            ) : (
              "—"
            )}
          </div>
          <Link
            href="/finance"
            className="mt-3 flex items-center justify-between rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-ink-3 transition-colors hover:border-ember/30 hover:text-ember"
          >
            <span className="flex items-center gap-2">
              <span aria-hidden>🔒</span> Full net worth &amp; debt
            </span>
            <span>Unlock in Finance →</span>
          </Link>
          {data ? <TopCategories spending={data.spending} /> : null}
        </>
      ) : (
        <>
          <div className="text-[10px] uppercase tracking-wider text-ink-3">
            Net worth
          </div>
          <div className="font-mono text-3xl tracking-tight text-ink-4">
            {data && !data.locked && data.netWorth != null ? (
              <CountUp value={data.netWorth} format={currency} />
            ) : (
              "—"
            )}
          </div>
          {data && !data.locked && data.debts > 0 ? (
            <div className="mt-3 flex items-center justify-between rounded-[3px] border border-danger/15 bg-danger/[0.06] px-3 py-2">
              <span className="flex items-center gap-2 text-xs text-ink-3">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                Debt remaining
              </span>
              <span className="font-mono text-sm text-danger">
                −{currency(data.debts)}
              </span>
            </div>
          ) : null}
          {data ? <TopCategories spending={data.spending} /> : null}
        </>
      )}
    </Panel>
  );
}

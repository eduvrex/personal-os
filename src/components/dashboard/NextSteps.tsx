"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { SparkIcon } from "@/components/icons";
import { sendJSON, useResource } from "@/lib/api";
import type { NudgeDTO } from "@/lib/types";

/**
 * Home card: latest proactive nudges read straight from the DB (NO AI on load).
 * Refresh button is the only thing that triggers generation here.
 */
export function NextSteps() {
  const { data, loading, error, reload } = useResource<NudgeDTO[]>("/api/assistant/nudges");
  const nudges = data ?? [];
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      await sendJSON("/api/assistant/nudges", "POST");
      reload();
    } finally {
      setRefreshing(false);
    }
  }

  async function dismiss(id: string) {
    await sendJSON(`/api/assistant/nudges/${id}`, "PATCH", { dismissed: true });
    reload();
  }

  return (
    <Panel
      title="Next steps toward your goals"
      meta={
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="btn-brut flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider disabled:opacity-50"
        >
          <SparkIcon className="text-[12px]" />
          {refreshing ? "Thinking…" : "Refresh"}
        </button>
      }
    >
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && nudges.length === 0 ? (
        <EmptyState>
          No nudges yet — hit Refresh to get your first proactive suggestions.
        </EmptyState>
      ) : (
        <ul className="flex flex-col">
          {nudges.map((n) => (
            <li
              key={n.id}
              className="group flex items-start gap-2.5 border-t border-white/[0.05] py-2.5 first:border-t-0"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ember" />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink-4">{n.text}</p>
                {n.plan ? (
                  <span className="mt-1 inline-block rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-3">
                    {n.plan}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss"
                className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink-4 group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

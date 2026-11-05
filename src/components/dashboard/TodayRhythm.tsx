"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/api";
import type { RhythmBlockDTO } from "@/lib/types";

/**
 * Home "Today" card: the day's
 * rhythm at a glance — where you are now and what's next. A humane routine, not
 * a checklist to fail. Neutral labels only; no health or care context here.
 */
export function TodayRhythm() {
  const { data, loading } = useResource<RhythmBlockDTO[]>("/api/rhythm/today");

  // Re-tick every minute so "now" tracks the day without a reload.
  const [nowMin, setNowMin] = useState(() => hhmm(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNowMin(hhmm(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  const blocks = useMemo(() => data ?? [], [data]);

  // The current block = the last timed block whose time has passed.
  const currentIdx = useMemo(() => {
    let idx = -1;
    blocks.forEach((b, i) => {
      if (b.at_time && b.at_time <= nowMin) idx = i;
    });
    return idx;
  }, [blocks, nowMin]);

  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });

  return (
    <Panel
      title="Today's rhythm"
      meta={
        <a href="/rhythm" className="text-ember hover:underline">
          {weekday.toLowerCase()} →
        </a>
      }
    >
      {blocks.length === 0 ? (
        <EmptyState>
          {loading ? "Loading…" : (
            <>
              No rhythm yet. <a href="/rhythm" className="text-ember hover:underline">Set your daily rhythm →</a>
            </>
          )}
        </EmptyState>
      ) : (
        <ul className="flex flex-col">
          {blocks.map((b, i) => {
            const isNow = i === currentIdx;
            const isPast = currentIdx >= 0 && i < currentIdx;
            return (
              <li
                key={b.id}
                className={`flex items-baseline gap-3 border-t border-white/[0.05] py-1.5 first:border-t-0 ${
                  isPast ? "opacity-45" : ""
                }`}
              >
                <span
                  className={`w-11 shrink-0 font-mono text-[11px] ${
                    isNow ? "text-ember" : "text-ink-3"
                  }`}
                >
                  {b.at_time ?? "—"}
                </span>
                <span className="flex-1">
                  <span className={`text-sm ${isNow ? "font-medium text-ink-4" : "text-ink-4"}`}>
                    {b.label}
                  </span>
                  {isNow ? (
                    <span className="ml-2 align-middle text-[9px] uppercase tracking-[0.14em] text-ember">
                      now
                    </span>
                  ) : null}
                  {b.detail && isNow ? (
                    <span className="mt-0.5 block text-xs text-ink-3">{b.detail}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** Local wall-clock as "HH:MM" (24h) for comparing against block times. */
function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

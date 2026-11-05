"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { modeLabel, totalHours, workBlocksFor, type WorkBlock } from "@/lib/workSchedule";

/**
 * Home "Work today" card — the work shifts for the current
 * weekday, from the fixed weekly config in lib/workSchedule. Mirrors
 * TodayRhythm's anatomy: mono times down the left, the current block
 * flagged "now", finished blocks receding.
 */
export function WorkToday() {
  // Resolve the date after mount so static prerenders never disagree
  // (the same guard PageHeader uses for its folio coordinates).
  const [today, setToday] = useState<Date | null>(null);
  const [nowMin, setNowMin] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setToday(d);
      setNowMin(hhmm(d));
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);

  const blocks: WorkBlock[] = today ? workBlocksFor(today) : [];
  const hours = totalHours(blocks);

  return (
    <Panel
      title="Work today"
      meta={blocks.length > 0 ? `${hours}h · career services` : "career services"}
    >
      {blocks.length === 0 ? (
        <EmptyState>{today ? "No work today." : "Loading…"}</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {blocks.map((b, i) => {
            // Zero-padded 24h strings compare lexicographically.
            const isNow = nowMin >= b.start && nowMin < b.end;
            const isPast = nowMin >= b.end;
            return (
              <li
                key={i}
                className={`flex items-baseline gap-3 border-t border-white/[0.05] py-1.5 first:border-t-0 ${
                  isPast ? "opacity-45" : ""
                }`}
              >
                <span
                  className={`w-[5.5rem] shrink-0 font-mono text-[11px] ${
                    isNow ? "text-ember" : "text-ink-3"
                  }`}
                >
                  {b.start}–{b.end}
                </span>
                <span className="flex-1">
                  <span className="text-sm text-ink-4">{modeLabel(b.mode)}</span>
                  {isNow ? (
                    <span className="ml-2 align-middle text-[9px] uppercase tracking-[0.14em] text-ember">
                      now
                    </span>
                  ) : null}
                  {b.mode === "varies" ? (
                    <span className="mt-0.5 block text-xs text-ink-3">Varies by week</span>
                  ) : null}
                  {b.note ? (
                    <span className="mt-0.5 block text-xs text-ink-3">{b.note}</span>
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

/** Local wall-clock as "HH:MM" (24h), matching TodayRhythm's helper. */
function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

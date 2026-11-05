"use client";

import Link from "next/link";

import { Panel } from "@/components/ui/Panel";
import { CheckIcon } from "@/components/icons";
import { heatColor } from "@/components/ui/heat";
import { sendJSON, useResource } from "@/lib/api";
import { localDateKey } from "@/lib/localDate";
import { HABITS } from "@/lib/config/habits";
import type { HabitStateDTO } from "@/lib/types";

interface HabitsResponse {
  today: HabitStateDTO;
  days: HabitStateDTO[];
}

/**
 * Last-30-days strip: one cell per day, ember depth = share of habits done.
 * Days the API has no record for render as empty cells.
 */
function HeatStrip({ days, total }: { days: HabitStateDTO[]; total: number }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cells = Array.from({ length: 30 }, (_, i) => {
    const date = localDateKey(
      new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000),
    );
    const day = byDate.get(date);
    return { date, done: day?.done.length ?? 0, total: day?.total ?? total };
  });

  return (
    <div className="mt-4 border-t border-white/[0.05] pt-3">
      <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-3">
        <span>Last 30 days</span>
        <span aria-hidden className="flex items-center gap-1">
          Less
          {[0, 1, 3, 5, 6].map((n) => (
            <span
              key={n}
              className="h-2 w-2 rounded-[2px]"
              style={{ background: heatColor(n, 6) }}
            />
          ))}
          More
        </span>
      </div>
      <div className="flex gap-[3px]">
        {cells.map((c) => (
          <span
            key={c.date}
            title={`${c.date} — ${c.done}/${c.total} habits`}
            className="h-3.5 min-w-0 flex-1 rounded-[2px] transition-colors duration-300"
            style={{ background: heatColor(c.done, c.total) }}
          />
        ))}
      </div>
    </div>
  );
}

/** Home card: six daily habit rings; click toggles a habit for today. */
export function HabitTracker() {
  const { data, loading, reload, setData } =
    useResource<HabitsResponse>("/api/habits?days=30");

  const today = data?.today;
  const doneSet = new Set(today?.done ?? []);
  const total = HABITS.length;

  async function toggle(id: string) {
    const next = new Set(doneSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const done = [...next];
    const date = today?.date ?? localDateKey();

    // Optimistic update.
    setData((prev) =>
      prev
        ? { ...prev, today: { ...prev.today, done, total } }
        : { today: { date, done, total }, days: [] },
    );

    try {
      await sendJSON(`/api/habits/${date}`, "POST", { done });
    } finally {
      reload();
    }
  }

  return (
    <Panel
      title="Habits"
      meta={
        <span className="flex items-center gap-2">
          <span>{loading ? "…" : `${doneSet.size}/${total}`}</span>
          <Link href="/habits" className="hover:text-ember">
            Open →
          </Link>
        </span>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {HABITS.map((habit) => {
          const on = doneSet.has(habit.id);
          return (
            <button
              key={habit.id}
              type="button"
              onClick={() => toggle(habit.id)}
              className="flex flex-col items-center gap-1.5 rounded-[3px] border border-white/[0.05] bg-white/[0.02] px-2 py-2.5 transition-all hover:border-ember/30 hover:bg-ember/[0.04] active:scale-95"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                  on
                    ? "border-ember bg-ember/15 text-ember shadow-[0_0_10px_-1px_var(--color-ember)]"
                    : "border-ink-3 text-transparent"
                }`}
              >
                <CheckIcon className="text-[14px]" />
              </span>
              <span
                className={`text-center text-[10px] font-medium uppercase tracking-wide ${
                  on ? "text-ink-4" : "text-ink-3"
                }`}
              >
                {habit.label}
              </span>
            </button>
          );
        })}
      </div>
      {data ? <HeatStrip days={data.days} total={total} /> : null}
    </Panel>
  );
}

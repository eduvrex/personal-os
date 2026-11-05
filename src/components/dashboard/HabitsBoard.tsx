"use client";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
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

const WINDOW_DAYS = 12 * 7; // 12 full weeks in the grid

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dates (YYYY-MM-DD) for the last `n` days, oldest first, ending today. */
function lastDates(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    localDateKey(new Date(Date.now() - (n - 1 - i) * DAY_MS)),
  );
}

interface DayCell {
  date: string;
  done: string[];
  total: number;
}

function buildCells(days: HabitStateDTO[], total: number): DayCell[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return lastDates(WINDOW_DAYS).map((date) => {
    const day = byDate.get(date);
    return { date, done: day?.done ?? [], total: day?.total ?? total };
  });
}

/** Longest and current runs of days satisfying `hit`, oldest-first cells. */
function streaks(cells: DayCell[], hit: (c: DayCell) => boolean) {
  let best = 0;
  let run = 0;
  for (const c of cells) {
    run = hit(c) ? run + 1 : 0;
    if (run > best) best = run;
  }
  let current = 0;
  for (let i = cells.length - 1; i >= 0 && hit(cells[i]); i--) current++;
  return { best, current };
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Panel className="flex-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        {label}
      </div>
      <div className="mt-1 font-mono text-3xl tracking-tight text-ink-4">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-ink-3">{sub}</div> : null}
    </Panel>
  );
}

/**
 * 12-week calendar heat grid: one column per week, one row per weekday,
 * ending today. Ember depth = share of habits done that day.
 */
function HeatGrid({ cells }: { cells: DayCell[] }) {
  // Pad the front so the first column starts on Monday.
  const firstDay = new Date(`${cells[0].date}T00:00:00`).getDay(); // 0=Sun
  const pad = (firstDay + 6) % 7; // days since Monday
  const padded: (DayCell | null)[] = [...Array<null>(pad).fill(null), ...cells];
  const weeks: (DayCell | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  return (
    <div className="flex gap-2">
      <div
        className="grid shrink-0 gap-[3px] text-[9px] uppercase leading-none text-ink-3"
        style={{ gridTemplateRows: "repeat(7, 14px)" }}
      >
        {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
          <span key={i} className="flex items-center">
            {d}
          </span>
        ))}
      </div>
      <div className="flex gap-[3px]">
        {weeks.map((week, w) => (
          <div key={w} className="grid w-3.5 gap-[3px]" style={{ gridTemplateRows: "repeat(7, 14px)" }}>
            {Array.from({ length: 7 }, (_, d) => {
              const cell = week[d] ?? null;
              return cell ? (
                <span
                  key={d}
                  title={`${cell.date} — ${cell.done.length}/${cell.total} habits`}
                  className="rounded-[3px] transition-colors duration-300"
                  style={{ background: heatColor(cell.done.length, cell.total) }}
                />
              ) : (
                <span key={d} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** One habit's row: label, current streak, and a 4-week binary strip. */
function HabitRow({
  habit,
  cells,
  on,
  onToggle,
}: {
  habit: { id: string; label: string };
  cells: DayCell[];
  on: boolean;
  onToggle: () => void;
}) {
  const hit = (c: DayCell) => c.done.includes(habit.id);
  const { best, current } = streaks(cells, hit);
  const last28 = cells.slice(-28);
  const rate = Math.round(
    (last28.filter(hit).length / Math.max(1, last28.length)) * 100,
  );

  return (
    <div className="flex items-center gap-3 rounded-[3px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={on}
        aria-label={`Toggle ${habit.label} for today`}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all active:scale-90 ${
          on
            ? "border-ember bg-ember/15 text-ember shadow-[0_0_10px_-1px_var(--color-ember)]"
            : "border-ink-3 text-transparent hover:border-ember/50"
        }`}
      >
        <CheckIcon className="text-[14px]" />
      </button>

      <div className="w-32 min-w-0 shrink-0">
        <div className="truncate text-sm text-ink-4">{habit.label}</div>
        <div className="text-[10px] text-ink-3">
          {current > 0 ? `${current}d streak` : "no streak"} · best {best}d · {rate}%
        </div>
      </div>

      <div className="flex flex-1 gap-[3px]">
        {last28.map((c) => (
          <span
            key={c.date}
            title={`${c.date} — ${hit(c) ? "done" : "not done"}`}
            className="h-3 min-w-0 flex-1 rounded-[2px] transition-colors duration-300"
            style={{ background: heatColor(hit(c) ? 1 : 0, 1, "sky") }}
          />
        ))}
      </div>
    </div>
  );
}

/** Habits tab: today's toggles, streak stats, 12-week grid, per-habit rows. */
export function HabitsBoard() {
  const { data, loading, error, reload, setData } = useResource<HabitsResponse>(
    `/api/habits?days=${WINDOW_DAYS}`,
  );

  const total = HABITS.length;
  const today = data?.today;
  const doneSet = new Set(today?.done ?? []);

  async function toggle(id: string) {
    const next = new Set(doneSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const done = [...next];
    const date = today?.date ?? localDateKey();

    // Optimistic update on both today and its history cell.
    setData((prev) => {
      if (!prev) return { today: { date, done, total }, days: [] };
      const days = prev.days.some((d) => d.date === date)
        ? prev.days.map((d) => (d.date === date ? { ...d, done, total } : d))
        : [...prev.days, { date, done, total }];
      return { today: { ...prev.today, done, total }, days };
    });

    try {
      await sendJSON(`/api/habits/${date}`, "POST", { done });
    } finally {
      reload();
    }
  }

  if (error && !data) {
    return (
      <Panel title="Habits">
        <EmptyState>{error}</EmptyState>
      </Panel>
    );
  }
  if (loading && !data) {
    return (
      <Panel title="Habits">
        <EmptyState>Loading…</EmptyState>
      </Panel>
    );
  }

  const cells = buildCells(data?.days ?? [], total);
  const anyDone = streaks(cells, (c) => c.done.length > 0);
  const perfect = streaks(cells, (c) => c.done.length >= c.total);
  const last30 = cells.slice(-30);
  const rate30 = Math.round(
    (last30.reduce((sum, c) => sum + c.done.length, 0) /
      Math.max(1, last30.reduce((sum, c) => sum + c.total, 0))) *
      100,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <StatTile
          label="Current streak"
          value={`${anyDone.current}d`}
          sub="days with at least one habit"
        />
        <StatTile label="Best streak" value={`${anyDone.best}d`} sub="last 12 weeks" />
        <StatTile label="Completion" value={`${rate30}%`} sub="last 30 days" />
        <StatTile
          label="Perfect days"
          value={`${cells.filter((c) => c.done.length >= c.total).length}`}
          sub={`best run ${perfect.best}d`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Today + per-habit rows */}
        <Panel
          title="Habits"
          meta={`today ${doneSet.size}/${total}`}
        >
          <div className="flex flex-col gap-2">
            {HABITS.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                cells={cells}
                on={doneSet.has(habit.id)}
                onToggle={() => toggle(habit.id)}
              />
            ))}
          </div>
        </Panel>

        {/* 12-week grid */}
        <Panel
          title="Last 12 weeks"
          meta={
            <span aria-hidden className="flex items-center gap-1 normal-case">
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
          }
        >
          <HeatGrid cells={cells} />
          <p className="mt-3 text-[11px] text-ink-3">
            Each cell is a day; deeper ember means more of your {total} habits done.
            Hover a cell for the date.
          </p>
        </Panel>
      </div>
    </div>
  );
}

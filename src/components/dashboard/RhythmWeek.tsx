"use client";

import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { useResource } from "@/lib/api";
import {
  WEEKDAY_KEYS,
  buildDay,
  currentIndex,
  fmtMinutes,
  nextIndex,
  summarizeDay,
  weekdayKeyFor,
  type DayItem,
  type WeekdayKey,
} from "@/lib/dayView";
import type { CheckinStatsDTO, RhythmBlockDTO } from "@/lib/types";

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

/** One hue per kind of block — the stripe down the left of each row. */
const KIND_STRIPE: Record<string, string> = {
  focus: "bg-ember",
  akrov: "bg-sun",
  class: "bg-iris-soft",
  work: "bg-sky",
  meal: "bg-sage",
  review: "bg-sun/60",
  practice: "bg-sage/60",
  "wind-down": "bg-ink-3/50",
  anchor: "bg-ink-3/50",
  training: "bg-sky/60",
};

/**
 * Rhythm → "Day by day": pick a weekday and see the whole day as one
 * timeline — classes, work shifts, focus blocks, when to leave for
 * campus and when to head home — with start–end times and every block's note.
 * Today opens by default, with the current block marked "now" and the next
 * one "next", so it doubles as the phone view of "what am I doing right now".
 */
export function RhythmWeek() {
  const { data, loading } = useResource<RhythmBlockDTO[]>("/api/rhythm");
  const { data: checkins } = useResource<CheckinStatsDTO>("/api/rhythm/checkins");

  // Resolve "today" after mount so the static prerender never disagrees.
  const [today, setToday] = useState<WeekdayKey | null>(null);
  const [day, setDay] = useState<WeekdayKey | null>(null);
  const [nowHM, setNowHM] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setToday(weekdayKeyFor(d));
      setNowHM(hhmm(d));
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  const selected = day ?? today ?? "mon";
  const isToday = selected === today;

  const items = useMemo(() => buildDay(data ?? [], selected), [data, selected]);
  const summary = useMemo(() => summarizeDay(items), [items]);
  const nowIdx = isToday ? currentIndex(items, nowHM) : -1;
  const nextIdx = isToday ? nextIndex(items, nowHM) : -1;

  return (
    <Panel
      title="Day by day"
      meta={
        <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
          {isToday ? "today" : DAY_LABEL[selected].toLowerCase()}
        </span>
      }
    >
      {/* Day picker */}
      <div className="mb-3 grid grid-cols-7 gap-1" role="tablist" aria-label="Day of the week">
        {WEEKDAY_KEYS.map((k) => {
          const active = k === selected;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setDay(k)}
              className={`rounded-[3px] border px-1 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                active
                  ? "border-ember/50 bg-ember/10 text-ember"
                  : "border-white/[0.08] text-ink-3 hover:border-white/20 hover:text-ink-4"
              }`}
            >
              {DAY_LABEL[k]}
              {k === today ? <span className="ml-0.5 text-ember">•</span> : null}
            </button>
          );
        })}
      </div>

      {/* Day summary */}
      {items.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-y border-white/[0.05] py-2 font-mono text-[11px] text-ink-3">
          {summary.leave ? <span>leave <b className="font-medium text-ink-4">{summary.leave}</b></span> : <span>home day</span>}
          {summary.headHome ? <span>head home <b className="font-medium text-ink-4">{summary.headHome}</b></span> : null}
          <span>focus <b className="font-medium text-ember">{fmtMinutes(summary.focusMin)}</b></span>
          {summary.classMin ? <span>class <b className="font-medium text-ink-4">{fmtMinutes(summary.classMin)}</b></span> : null}
          {summary.workMin ? <span>work <b className="font-medium text-ink-4">{fmtMinutes(summary.workMin)}</b></span> : null}
          {checkins && checkins.asked > 0 ? (
            <span className="ml-auto" title="Telegram check-ins answered this week (since Monday)">
              this week <b className="font-medium text-ok">{checkins.done}</b>
              {checkins.partial ? <> + <b className="font-medium text-sun">{checkins.partial}½</b></> : null}
              <span className="text-ink-3"> / {checkins.asked} done</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>{loading ? "Loading…" : "Nothing planned for this day."}</EmptyState>
      ) : (
        <ol className="flex flex-col">
          {items.map((it, i) => (
            <DayRow
              key={it.key}
              item={it}
              state={i === nowIdx ? "now" : i === nextIdx ? "next" : isToday && it.end !== null && it.end <= nowHM ? "past" : "idle"}
              outcome={isToday ? checkins?.today[it.key] : undefined}
            />
          ))}
        </ol>
      )}
    </Panel>
  );
}

const OUTCOME_MARK: Record<string, { text: string; cls: string }> = {
  done: { text: "✓ done", cls: "text-ok" },
  partial: { text: "½ partly", cls: "text-sun" },
  skipped: { text: "✗ skipped", cls: "text-danger" },
};

function DayRow({
  item,
  state,
  outcome,
}: {
  item: DayItem;
  state: "now" | "next" | "past" | "idle";
  outcome?: string;
}) {
  const mark = outcome ? OUTCOME_MARK[outcome] : undefined;
  const stripe = KIND_STRIPE[item.kind] ?? "bg-ink-3/50";
  return (
    <li
      className={`flex gap-3 border-t border-white/[0.05] py-2 first:border-t-0 ${
        state === "past" ? "opacity-40" : ""
      } ${state === "now" ? "-mx-2 rounded-[3px] bg-ember/[0.07] px-2" : ""}`}
    >
      <span aria-hidden className={`w-[3px] shrink-0 rounded-full ${stripe}`} />
      <span
        className={`w-[5.5rem] shrink-0 pt-px font-mono text-[11px] ${
          state === "now" ? "text-ember" : "text-ink-3"
        }`}
      >
        {item.start}
        {item.end ? `–${item.end}` : ""}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm text-ink-4">
          {item.label}
          {state === "now" || state === "next" ? (
            <span
              className={`ml-2 align-middle text-[9px] uppercase tracking-[0.14em] ${
                state === "now" ? "text-ember" : "text-ink-3"
              }`}
            >
              {state}
            </span>
          ) : null}
          {mark ? (
            <span className={`ml-2 align-middle font-mono text-[10px] ${mark.cls}`}>{mark.text}</span>
          ) : null}
        </span>
        {item.detail ? (
          <span className="mt-0.5 block text-xs leading-snug text-ink-3">{item.detail}</span>
        ) : null}
      </span>
    </li>
  );
}

/** Local wall-clock as "HH:MM" (24h). */
function hhmm(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

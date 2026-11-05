"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { AsteriskCluster } from "@/components/ui/PageHeader";
import { CheckIcon } from "@/components/icons";
import { TaskItem } from "@/components/dashboard/TaskItem";
import { sendJSON, useResource } from "@/lib/api";
import { addDays, effectiveLane, localDayKey } from "@/lib/taskLane";
import { courseCode } from "@/lib/format";
import {
  LOCKIN,
  LOCKIN_DAILY,
  LOCKIN_RULES,
  LOCKIN_UNBLOCK,
  daysBetween,
  lockinDay,
  nextMajor,
  upcomingKeyDates,
  type LockinCheck,
  type LockinKeyDate,
} from "@/lib/config/lockin";
import type { LockinStateDTO, TaskDTO } from "@/lib/types";

/**
 * The lock-in front page (config/lockin.ts). Answers three questions in
 * order: how long until the next exam, what must happen today, and what is
 * coming this week. Deliberately carries no grades/GPA/standing — that record
 * is advisor-only (tests/unit/academicPrivacy.test.ts).
 */

function fmtDay(key: string): string {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(hhmm?: string | null): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function countdownWords(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days`;
}

/** Hero: the next exam, huge, plus the run counter and the streak. */
function Hero({ today, streak }: { today: string; streak: number | null }) {
  const next = nextMajor(today);
  const { day, total } = lockinDay(today);
  const toEnd = daysBetween(today, LOCKIN.end);
  const toNext = next ? daysBetween(today, next.date) : null;

  return (
    <div className="relative col-span-full mb-2 mt-4 overflow-visible px-1">
      <span
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-20 h-64 w-[36rem] bg-[radial-gradient(50%_50%_at_35%_45%,color-mix(in_srgb,var(--color-ember)_20%,transparent),transparent_70%)]"
      />
      <div className="relative">
        <p className="section-label mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-ember">Lock-in mode</span>
          <span className="text-faint">— Day {day} of {total}</span>
          <span className="text-faint">— {toEnd > 0 ? `${toEnd} days to the last exam` : "last exam today"}</span>
        </p>
        {next ? (
          <h1 className="font-display text-5xl leading-[0.95] text-ink-4 sm:text-7xl">
            {countdownWords(toNext ?? 0)}
            <span className="text-ink-3"> to </span>
            <em className="italic text-ember">{next.label}</em>
            <AsteriskCluster spin={false} />
          </h1>
        ) : (
          <h1 className="font-display text-5xl leading-[0.95] text-ink-4 sm:text-7xl">
            Run complete<AsteriskCluster spin={false} />
          </h1>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
          {next ? (
            <span>
              {next.course} · {fmtDay(next.date)}
              {next.time ? ` · ${fmtTime(next.time)}` : ""}
              {next.note ? ` · ${next.note}` : ""}
            </span>
          ) : null}
          <span className="text-ember">
            Streak {streak == null ? "…" : streak} {streak === 1 ? "day" : "days"}
          </span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <span aria-hidden className="rule-block" />
          <span aria-hidden className="h-px flex-1 bg-white/[0.1]" />
          <Link
            href="/home"
            className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-3 hover:text-ember"
          >
            Full dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** One tickable row — shared by the daily checks and the unblockers. */
function CheckRow({
  item,
  done,
  onToggle,
  busy,
}: {
  item: LockinCheck;
  done: boolean;
  onToggle: () => void;
  busy: boolean;
}) {
  return (
    <li className="border-t border-white/[0.05] first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={done}
        className="flex w-full items-start gap-3 py-2.5 text-left disabled:opacity-60"
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
            done ? "border-ember/60 bg-ember/25 text-ember" : "border-white/20 text-transparent hover:border-ember/50"
          }`}
        >
          <CheckIcon width={14} height={14} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm leading-snug ${done ? "text-ink-3 line-through" : "text-ink-4"}`}>
            {item.label}
          </span>
          {item.detail ? <span className="mt-0.5 block text-xs text-ink-3">{item.detail}</span> : null}
        </span>
      </button>
    </li>
  );
}

/** Last 14 days: filled = every check done, half = some, empty = none. */
function StreakStrip({ history, today }: { history: LockinStateDTO["history"]; today: string }) {
  const byDate = new Map(history.map((h) => [h.date, h.done.length]));
  const cells = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).filter((d) => d >= LOCKIN.start);
  if (cells.length === 0) return null;
  return (
    <div className="mt-3 border-t border-white/[0.05] pt-3">
      <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-3">Since lock-in started</div>
      <div className="flex gap-[3px]">
        {cells.map((d) => {
          const n = byDate.get(d) ?? 0;
          const full = n >= LOCKIN_DAILY.length;
          return (
            <span
              key={d}
              title={`${fmtDay(d)} — ${n}/${LOCKIN_DAILY.length}`}
              className={`h-3.5 min-w-0 flex-1 rounded-[2px] ${
                full ? "bg-ember" : n > 0 ? "bg-ember/35" : "bg-white/[0.06]"
              } ${d === today ? "ring-1 ring-ember/60" : ""}`}
            />
          );
        })}
      </div>
    </div>
  );
}

interface WeekRow {
  date: string;
  kind: "key" | "task";
  key?: LockinKeyDate;
  task?: TaskDTO;
}

/** School work and key dates in the next 7 days, grouped by day. */
function NextSeven({ tasks, today }: { tasks: TaskDTO[]; today: string }) {
  const horizon = addDays(today, 7);
  const rows: WeekRow[] = [
    ...upcomingKeyDates(today)
      .filter((k) => k.date > today && k.date <= horizon)
      .map((k) => ({ date: k.date, kind: "key" as const, key: k })),
    ...tasks
      .filter((t) => t.due_date && t.due_date.slice(0, 10) > today && t.due_date.slice(0, 10) <= horizon)
      .map((t) => ({ date: t.due_date!.slice(0, 10), kind: "task" as const, task: t })),
  ];
  const days = [...new Set(rows.map((r) => r.date))].sort();

  if (days.length === 0) return <EmptyState>Nothing dated in the next 7 days.</EmptyState>;

  return (
    <ol className="flex flex-col gap-3">
      {days.map((d) => (
        <li key={d}>
          <div className="mb-1 flex items-baseline gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-4">{fmtDay(d)}</span>
            <span className="font-mono text-[10px] text-faint">in {daysBetween(today, d)}d</span>
          </div>
          <ul className="flex flex-col">
            {rows
              .filter((r) => r.date === d)
              .sort((a, b) => (a.kind === "key" ? -1 : 0) - (b.kind === "key" ? -1 : 0))
              .map((r) =>
                r.kind === "key" && r.key ? (
                  <li
                    key={`k-${r.key.label}`}
                    className={`flex items-start gap-2 border-t border-white/[0.05] py-2 first:border-t-0 ${
                      r.key.major ? "text-ember" : "text-ink-4"
                    }`}
                  >
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span className="min-w-0 flex-1 text-sm">
                      <b className="font-semibold">{r.key.label}</b>
                      {r.key.time ? ` · ${fmtTime(r.key.time)}` : ""}
                      {r.key.note ? <span className="text-ink-3"> · {r.key.note}</span> : null}
                    </span>
                    <Tag label={r.key.course} tone={r.key.major ? "rose" : "neutral"} />
                  </li>
                ) : r.task ? (
                  <li
                    key={r.task.id}
                    className="flex items-start gap-2 border-t border-white/[0.05] py-2 first:border-t-0"
                  >
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />
                    <span className="min-w-0 flex-1 break-words text-sm text-ink-4">
                      {r.task.title}
                      {r.task.due_time ? <span className="text-ink-3"> · {fmtTime(r.task.due_time)}</span> : null}
                    </span>
                    {r.task.course_name ? <Tag label={courseCode(r.task.course_name)} /> : null}
                  </li>
                ) : null,
              )}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function LockInBoard() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDayKey()), []);

  const state = useResource<LockinStateDTO>("/api/lockin");
  const tasksRes = useResource<TaskDTO[]>("/api/tasks?status=open&domain=school");
  const [busy, setBusy] = useState(false);

  const day = today ?? LOCKIN.start;
  const daily = state.data?.daily ?? [];
  const unblock = state.data?.unblock ?? [];
  const tasks = tasksRes.data ?? [];
  const dueToday = tasks.filter((t) => effectiveLane(t, day) === "today");

  async function toggle(scope: "daily" | "unblock", id: string) {
    const current = scope === "daily" ? daily : unblock;
    const done = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    if (state.data) {
      state.setData({ ...state.data, [scope]: done });
    }
    setBusy(true);
    try {
      const next = await sendJSON<LockinStateDTO>("/api/lockin", "POST", {
        scope,
        date: state.data?.today ?? day,
        done,
      });
      state.setData(next);
    } catch {
      state.reload();
    } finally {
      setBusy(false);
    }
  }

  const dailyDone = LOCKIN_DAILY.filter((c) => daily.includes(c.id)).length;
  const unblockOpen = LOCKIN_UNBLOCK.filter((c) => !unblock.includes(c.id));
  const unblockDone = LOCKIN_UNBLOCK.filter((c) => unblock.includes(c.id));
  const keyDates = upcomingKeyDates(day);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Hero today={day} streak={state.data ? state.data.streak : null} />

      {/* Left: what must happen today */}
      <div className="flex flex-col gap-4 lg:col-span-5">
        <Panel
          title="Today's non-negotiables"
          meta={state.loading ? "…" : `${dailyDone}/${LOCKIN_DAILY.length}`}
        >
          {state.error && !state.data ? (
            <ErrorNote message={state.error} onRetry={state.reload} />
          ) : (
            <>
              <ul className="flex flex-col">
                {LOCKIN_DAILY.map((c) => (
                  <CheckRow
                    key={c.id}
                    item={c}
                    done={daily.includes(c.id)}
                    busy={busy || !state.data}
                    onToggle={() => toggle("daily", c.id)}
                  />
                ))}
              </ul>
              {state.data ? <StreakStrip history={state.data.history} today={state.data.today} /> : null}
            </>
          )}
        </Panel>

        <Panel title="Unblock" meta={state.loading ? "…" : `${unblockOpen.length} open`}>
          {unblockOpen.length === 0 && state.data ? (
            <EmptyState>Everything unblocked.</EmptyState>
          ) : (
            <ul className="flex flex-col">
              {unblockOpen.map((c) => (
                <CheckRow
                  key={c.id}
                  item={c}
                  done={false}
                  busy={busy || !state.data}
                  onToggle={() => toggle("unblock", c.id)}
                />
              ))}
            </ul>
          )}
          {unblockDone.length > 0 ? (
            <details className="mt-2 border-t border-white/[0.05] pt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                Done · {unblockDone.length}
              </summary>
              <ul className="flex flex-col">
                {unblockDone.map((c) => (
                  <CheckRow key={c.id} item={c} done busy={busy} onToggle={() => toggle("unblock", c.id)} />
                ))}
              </ul>
            </details>
          ) : null}
        </Panel>

        <Panel title="Rules">
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-snug text-ink-4 marker:font-mono marker:text-ember">
            {LOCKIN_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ol>
        </Panel>
      </div>

      {/* Right: the work itself */}
      <div className="flex flex-col gap-4 lg:col-span-7">
        <Panel title="Due today" meta={tasksRes.loading ? "…" : `${dueToday.length} open`}>
          {tasksRes.error && !tasksRes.data ? (
            <ErrorNote message={tasksRes.error} onRetry={tasksRes.reload} />
          ) : !tasksRes.loading && dueToday.length === 0 ? (
            <EmptyState>Nothing due today or overdue. Get ahead on tomorrow.</EmptyState>
          ) : (
            <ul className="flex flex-col">
              {dueToday.map((t) => (
                <TaskItem key={t.id} task={t} onChange={tasksRes.reload} wrap />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Next 7 days">
          {tasksRes.error && !tasksRes.data ? (
            <ErrorNote message={tasksRes.error} onRetry={tasksRes.reload} />
          ) : (
            <NextSeven tasks={tasks} today={day} />
          )}
        </Panel>

        <Panel title="Countdown" meta={`${keyDates.length} left`}>
          <ul className="flex flex-col">
            {keyDates.map((k) => {
              const n = daysBetween(day, k.date);
              return (
                <li
                  key={k.date + k.label}
                  className="grid grid-cols-[4.5rem_1fr] items-baseline gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0"
                >
                  <span
                    className={`font-mono text-2xl tabular-nums leading-none ${k.major ? "text-ember" : "text-ink-3"}`}
                  >
                    {n <= 0 ? "now" : `${n}d`}
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm ${k.major ? "font-semibold text-ink-4" : "text-ink-4"}`}>
                      {k.label} <span className="font-normal text-ink-3">· {k.course}</span>
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                      {fmtDay(k.date)}
                      {k.time ? ` · ${fmtTime(k.time)}` : ""}
                      {k.note ? ` · ${k.note}` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

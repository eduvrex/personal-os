"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { sendJSON, useResource } from "@/lib/api";
import { localDateKey } from "@/lib/localDate";
import { PROFILE } from "@/lib/config/profile";
import type { HabitStateDTO } from "@/lib/types";

interface HabitsResponse {
  today: HabitStateDTO;
  days: HabitStateDTO[];
}

/** Consecutive days up to today with at least one habit done. */
function computeStreak(days: HabitStateDTO[]): number {
  const active = new Map(days.map((d) => [d.date, d.done.length]));
  let streak = 0;
  for (let i = 0; ; i++) {
    const key = localDateKey(new Date(Date.now() - i * 24 * 60 * 60 * 1000));
    if ((active.get(key) ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

export function Operator() {
  const { data: intentionData, reload } =
    useResource<{ intention: string }>("/api/intention");
  const { data: habits } = useResource<HabitsResponse>("/api/habits?days=60");

  const [value, setValue] = useState("");
  useEffect(() => {
    if (intentionData) setValue(intentionData.intention);
  }, [intentionData]);

  const streak = habits ? computeStreak(habits.days) : 0;

  async function save() {
    if (value === (intentionData?.intention ?? "")) return;
    await sendJSON("/api/intention", "POST", { intention: value });
    reload();
  }

  return (
    <Panel>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-ember/30 bg-ember/10 font-display text-lg italic text-ember">
          {PROFILE.initial}
        </div>
        <div className="min-w-0">
          <div className="truncate font-display text-lg text-ink-4">{PROFILE.name}</div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{PROFILE.role}</div>
        </div>
        {streak > 0 ? (
          <div className="ml-auto text-right">
            <div className="font-mono text-xl text-ink-4">{streak}</div>
            <div className="text-[10px] uppercase tracking-wider text-ink-3">
              day streak
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-[3px] border-l-2 border-ember/60 bg-ember/[0.06] px-3 py-2.5">
        <div className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-ember">
          Today&apos;s intention
        </div>
        {/* The one hand-written moment on the Home page — italic serif. */}
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Set your intention for today…"
          className="mt-1 w-full bg-transparent font-display text-base italic text-ink-4 placeholder:text-ink-3 focus:outline-none"
        />
      </div>
    </Panel>
  );
}

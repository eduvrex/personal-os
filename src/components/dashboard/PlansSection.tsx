"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { CheckIcon } from "@/components/icons";
import { sendJSON, useResource } from "@/lib/api";
import type { Milestone, PlanDTO } from "@/lib/types";

interface PlansResponse {
  plans: PlanDTO[];
  savings: number;
}

function countdown(dateKey: string | null): string | null {
  if (!dateKey) return null;
  const days = Math.round(
    (Date.parse(`${dateKey}T00:00:00`) - Date.now()) / 86_400_000,
  );
  if (days < 0) return "past target";
  if (days < 31) return `in ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30.44);
  return `in ${months} month${months === 1 ? "" : "s"}`;
}

function currency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function PlansSection() {
  const { data, error, reload } = useResource<PlansResponse>("/api/plans");
  const plans = data?.plans ?? [];
  const savings = data?.savings ?? 0;

  async function addPlan(title: string) {
    await sendJSON("/api/plans", "POST", { title });
    reload();
  }

  return (
    <Panel title="Plans">
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : plans.length === 0 ? (
        <EmptyState>No plans yet — add one below.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} savings={savings} onChanged={reload} />
          ))}
        </div>
      )}
      <AddRow placeholder="Add a plan…" onAdd={addPlan} />
    </Panel>
  );
}

function PlanCard({
  plan,
  savings,
  onChanged,
}: {
  plan: PlanDTO;
  savings: number;
  onChanged: () => void;
}) {
  const cd = countdown(plan.target_date);
  const tracks = plan.tracks ?? [];

  async function saveNotes(notes: string) {
    await sendJSON(`/api/plans/${plan.id}`, "PATCH", { notes });
    onChanged();
  }
  async function saveSavingsTarget(value: string) {
    await sendJSON(`/api/plans/${plan.id}`, "PATCH", {
      savings_target: Math.max(0, parseFloat(value) || 0),
    });
    onChanged();
  }

  return (
    <div className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-ink-4">{plan.title}</div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          {cd ? <span className="text-ember">{cd}</span> : null}
          <span className="font-mono">{plan.progress}%</span>
        </div>
      </div>
      <Bar value={plan.progress / 100} />

      {plan.notes !== null || tracks.length > 0 ? (
        <textarea
          defaultValue={plan.notes ?? ""}
          rows={2}
          placeholder="Notes…"
          onBlur={(e) => {
            if (e.target.value !== (plan.notes ?? "")) saveNotes(e.target.value);
          }}
          className="mt-2 w-full resize-y rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs text-ink-3 focus:border-ember/30 focus:outline-none"
        />
      ) : null}

      {/* Savings target vs current savings */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
        <span>Savings target</span>
        <input
          type="number"
          inputMode="decimal"
          defaultValue={plan.savings_target ?? ""}
          placeholder="—"
          onBlur={(e) => {
            if (e.target.value !== String(plan.savings_target ?? "")) {
              saveSavingsTarget(e.target.value);
            }
          }}
          className="w-24 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-ink-4 focus:border-ember/30 focus:outline-none"
        />
        {plan.savings_target ? (
          <span className="font-mono">
            {currency(savings)} / {currency(plan.savings_target)}
          </span>
        ) : null}
      </div>
      {plan.savings_target ? (
        <Bar value={savings / plan.savings_target} className="mt-1" />
      ) : null}

      {/* Tracks (collapsible) or own milestones */}
      {tracks.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {tracks.map((t) => (
            <TrackBlock key={t.id} track={t} onChanged={onChanged} />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <MilestoneList planId={plan.id} milestones={plan.milestones} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function TrackBlock({ track, onChanged }: { track: PlanDTO; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[3px] border border-white/[0.05] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-medium text-ink-4">
          <span className="mr-1 text-ink-3">{open ? "▾" : "▸"}</span>
          {track.title}
        </span>
        <span className="font-mono text-[11px] text-ink-3">{track.progress}%</span>
      </button>
      <div className="px-3 pb-1">
        <Bar value={track.progress / 100} />
      </div>
      {open ? (
        <div className="px-3 pb-3 pt-1">
          <MilestoneList planId={track.id} milestones={track.milestones} onChanged={onChanged} />
        </div>
      ) : null}
    </div>
  );
}

function MilestoneList({
  planId,
  milestones,
  onChanged,
}: {
  planId: string;
  milestones: Milestone[];
  onChanged: () => void;
}) {
  async function save(next: Milestone[]) {
    await sendJSON(`/api/plans/${planId}`, "PATCH", { milestones: next });
    onChanged();
  }
  const toggle = (i: number) =>
    save(milestones.map((m, idx) => (idx === i ? { ...m, done: !m.done } : m)));
  const remove = (i: number) => save(milestones.filter((_, idx) => idx !== i));
  const add = (label: string) => save([...milestones, { label, done: false }]);

  return (
    <div className="flex flex-col">
      {milestones.map((m, i) => (
        <div key={i} className="group flex items-center gap-2.5 py-1.5">
          <button
            type="button"
            onClick={() => toggle(i)}
            aria-label={m.done ? "Mark not done" : "Mark done"}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
              m.done
                ? "border-ember/40 bg-ember/20 text-ember"
                : "border-white/15 text-transparent hover:border-ember/40"
            }`}
          >
            <CheckIcon className="text-[10px]" />
          </button>
          <span className={`flex-1 text-xs ${m.done ? "text-ink-3 line-through" : "text-ink-4"}`}>
            {m.label}
          </span>
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="Delete milestone"
            className="text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
      <AddRow placeholder="Add a milestone…" onAdd={(l) => add(l)} subtle />
    </div>
  );
}

function Bar({ value, className = "" }: { value: number; className?: string }) {
  const pct = Math.min(1, Math.max(0, value)) * 100;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}>
      <div className="h-full rounded-full bg-ember" style={{ width: `${pct}%` }} />
    </div>
  );
}

function AddRow({
  placeholder,
  onAdd,
  subtle,
}: {
  placeholder: string;
  onAdd: (text: string) => Promise<void> | void;
  subtle?: boolean;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = value.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text);
      setValue("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className={`mt-2 flex items-center gap-2 rounded-[3px] border border-dashed border-white/[0.08] px-2.5 ${
        subtle ? "py-1" : "py-2"
      } focus-within:border-ember/30`}
    >
      <span className="text-ink-3">+</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        className="w-full bg-transparent text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
      />
    </form>
  );
}

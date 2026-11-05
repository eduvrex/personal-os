"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Tag } from "@/components/ui/Tag";
import { sendJSON, useResource } from "@/lib/api";
import type { WorkoutDTO } from "@/lib/types";

/**
 * Fitness tab — workout list (manual adds + rows pushed by the external
 * lifting app through /api/fitness/workouts), newest first. Deliberately
 * simple; built to grow once the lifting app starts pushing richer data.
 */
export function FitnessBoard() {
  const { data: workouts, error, reload } = useResource<WorkoutDTO[]>("/api/fitness/workouts");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {error && !workouts ? <ErrorNote message={error} onRetry={reload} /> : null}
      <Panel
        title="Workouts"
        meta={
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="rounded-[2px] border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/40 hover:text-ember"
          >
            {showForm ? "close" : "+ workout"}
          </button>
        }
      >
        {showForm ? (
          <WorkoutForm
            onSaved={() => {
              setShowForm(false);
              reload();
            }}
          />
        ) : null}
        {(workouts ?? []).length === 0 && !showForm ? (
          <EmptyState>
            No workouts yet — add one, or point the lifting app at the ingest endpoint.
          </EmptyState>
        ) : (
          <ul className="flex flex-col">
            {(workouts ?? []).map((w) => (
              <WorkoutRow key={w.id} workout={w} onChanged={reload} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function WorkoutRow({ workout: w, onChanged }: { workout: WorkoutDTO; onChanged: () => void }) {
  const when = new Date(w.performed_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  async function remove() {
    await sendJSON(`/api/fitness/workouts/${w.id}`, "DELETE");
    onChanged();
  }

  return (
    <li className="group flex items-center gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-ink-4">{w.name}</span>
          {w.type ? <Tag label={w.type} /> : null}
          {w.source !== "manual" ? <Tag label={w.source} kind="personal" /> : null}
        </div>
        {w.notes ? <div className="truncate text-xs text-ink-3">{w.notes}</div> : null}
      </div>
      {w.duration_min != null ? (
        <span className="font-mono text-xs text-ink-3">{w.duration_min} min</span>
      ) : null}
      <span className="font-mono text-xs text-ink-3">{when}</span>
      <button
        type="button"
        onClick={remove}
        aria-label="Delete workout"
        className="text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}

const inputCls =
  "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/40 focus:outline-none";
const labelCls = "text-[10px] uppercase tracking-wider text-ink-3";

function WorkoutForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [performedAt, setPerformedAt] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/fitness/workouts", "POST", {
        name,
        type: type || null,
        performed_at: new Date(performedAt).toISOString(),
        duration_min: duration || null,
        notes: notes || null,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 flex flex-col gap-2 rounded-[3px] border border-dashed border-white/[0.08] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2">
          <div className={labelCls}>Name</div>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Push day" required />
        </div>
        <div>
          <div className={labelCls}>Type</div>
          <input className={inputCls} value={type} onChange={(e) => setType(e.target.value)} placeholder="strength" />
        </div>
        <div>
          <div className={labelCls}>Duration (min)</div>
          <input className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" />
        </div>
        <div className="col-span-2">
          <div className={labelCls}>When</div>
          <input
            type="datetime-local"
            className={inputCls}
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
            required
          />
        </div>
        <div className="col-span-2">
          <div className={labelCls}>Notes</div>
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="self-start rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save workout"}
      </button>
    </form>
  );
}

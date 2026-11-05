"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { CheckIcon } from "@/components/icons";
import { sendJSON, useResource } from "@/lib/api";
import type { GoalItem, GoalsDTO, Milestone, PathDTO } from "@/lib/types";

type Scope = "week" | "semester";

/** Goals tab: short-term goals (week / semester) + long-term paths. */
export function GoalsBoard() {
  const { data: goals, error: goalsError, reload: reloadGoals } =
    useResource<GoalsDTO>("/api/goals");
  const { data: paths, error: pathsError, reload: reloadPaths } =
    useResource<PathDTO[]>("/api/paths");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {(goalsError && !goals) || (pathsError && !paths) ? (
        <ErrorNote
          message={goalsError && !goals ? goalsError : pathsError}
          onRetry={() => {
            reloadGoals();
            reloadPaths();
          }}
        />
      ) : null}
      <GoalList
        title="This Week"
        scope="week"
        items={goals?.week ?? []}
        onSaved={reloadGoals}
      />
      <GoalList
        title="This Semester"
        scope="semester"
        items={goals?.semester ?? []}
        onSaved={reloadGoals}
      />

      <Panel title="Long-term Paths">
        <p className="-mt-1 mb-3 text-xs text-ink-3">
          Big directions with milestones. Check them off to watch progress climb.
        </p>
        {(paths ?? []).length === 0 ? (
          <EmptyState>No paths yet — add one below.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {(paths ?? []).map((path, i) => (
              <PathCard key={path.id} path={path} index={i} onSaved={reloadPaths} />
            ))}
          </div>
        )}
        <AddRow placeholder="Add a long-term path…" onAdd={async (title) => {
          await sendJSON("/api/paths", "POST", { title });
          reloadPaths();
        }} />
      </Panel>
    </div>
  );
}

function GoalList({
  title,
  scope,
  items,
  onSaved,
}: {
  title: string;
  scope: Scope;
  items: GoalItem[];
  onSaved: () => void;
}) {
  async function save(next: GoalItem[]) {
    await sendJSON("/api/goals", "POST", { scope, items: next });
    onSaved();
  }
  const toggle = (i: number) =>
    save(items.map((it, idx) => (idx === i ? { ...it, done: !it.done } : it)));
  const remove = (i: number) => save(items.filter((_, idx) => idx !== i));
  const add = (text: string) => save([...items, { text, done: false }]);

  return (
    <Panel title={title}>
      {items.length === 0 ? (
        <EmptyState>None yet.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {items.map((item, i) => (
            <li
              key={i}
              className="group flex items-center gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0"
            >
              <Checkbox done={item.done} onClick={() => toggle(i)} />
              <span
                className={`flex-1 text-sm ${
                  item.done ? "text-ink-3 line-through" : "text-ink-4"
                }`}
              >
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Delete goal"
                className="text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddRow placeholder={`Add a ${scope} goal…`} onAdd={add} />
    </Panel>
  );
}

function PathCard({ path, index = 0, onSaved }: { path: PathDTO; index?: number; onSaved: () => void }) {
  // One hue per path — the design pass's domain-color rotation.
  const hue = (["ember", "iris", "sun", "sky"] as const)[index % 4];
  async function saveMilestones(next: Milestone[]) {
    await sendJSON(`/api/paths/${path.id}`, "PATCH", { milestones: next });
    onSaved();
  }
  const toggle = (i: number) =>
    saveMilestones(
      path.milestones.map((m, idx) => (idx === i ? { ...m, done: !m.done } : m)),
    );
  const add = (label: string) =>
    saveMilestones([...path.milestones, { label, done: false }]);

  return (
    <div className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-4">{path.title}</span>
        <span className="font-mono text-xs text-ink-3">{path.progress}%</span>
      </div>
      <ProgressBar value={path.progress / 100} hue={hue} className="mb-2" />
      <ul className="flex flex-col">
        {path.milestones.map((m, i) => (
          <li key={i} className="flex items-center gap-2.5 py-1.5">
            <Checkbox done={m.done} onClick={() => toggle(i)} small />
            <span
              className={`text-xs ${
                m.done ? "text-ink-3 line-through" : "text-ink-4"
              }`}
            >
              {m.label}
            </span>
          </li>
        ))}
      </ul>
      <AddRow placeholder="Add a milestone…" onAdd={add} subtle />
    </div>
  );
}

function Checkbox({
  done,
  onClick,
  small,
}: {
  done: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  const size = small ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? "Mark not done" : "Mark done"}
      className={`flex ${size} shrink-0 items-center justify-center rounded-[2px] border transition-colors ${
        done
          ? "border-ember/40 bg-ember/20 text-ember"
          : "border-white/15 text-transparent hover:border-ember/40"
      }`}
    >
      <CheckIcon className={small ? "text-[10px]" : "text-[12px]"} />
    </button>
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
        subtle ? "py-1.5" : "py-2"
      } focus-within:border-ember/30`}
    >
      <span className="text-ink-3">+</span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
        className="w-full bg-transparent text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
      />
    </form>
  );
}

"use client";

import { Panel } from "@/components/ui/Panel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { useResource } from "@/lib/api";
import type { GoalsDTO, PathDTO } from "@/lib/types";

/** Home card: a glance at semester goals + the first long-term path. */
export function GoalsSnapshot() {
  const { data: goals, error: goalsError, reload: reloadGoals } = useResource<GoalsDTO>("/api/goals");
  const { data: paths, error: pathsError, reload: reloadPaths } = useResource<PathDTO[]>("/api/paths");

  const semester = (goals?.semester ?? []).slice(0, 3);
  const path = (paths ?? [])[0];
  const empty = semester.length === 0 && !path;

  return (
    <Panel title="Goals" meta="Snapshot">
      {(goalsError && !goals) || (pathsError && !paths) ? (
        <ErrorNote
          message={goalsError ?? pathsError}
          onRetry={() => {
            reloadGoals();
            reloadPaths();
          }}
        />
      ) : empty ? (
        <EmptyState>Set your first goal in the Goals tab — small ones count.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {semester.map((goal, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] ${
                  goal.done ? "bg-ember/20 text-ember" : "border border-white/15"
                }`}
              >
                {goal.done ? "✓" : ""}
              </span>
              <span className={goal.done ? "text-ink-3 line-through" : "text-ink-4"}>
                {goal.text}
              </span>
            </div>
          ))}

          {path ? (
            <div className="mt-1 rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-ink-4">
                  <span className="rounded bg-ember/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-ember">
                    Path
                  </span>
                  {path.title}
                </span>
                <span className="font-mono text-xs text-ink-3">
                  {path.progress}%
                </span>
              </div>
              <ProgressBar value={path.progress / 100} />
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

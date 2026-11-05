"use client";

import { Panel } from "@/components/ui/Panel";
import { Tag } from "@/components/ui/Tag";
import { courseCode } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";
import type { TaskDTO, Urgency } from "@/lib/types";

const COLUMNS: { key: Urgency; title: string }[] = [
  { key: "inbox", title: "Inbox" },
  { key: "today", title: "Today" },
  { key: "week", title: "This Week" },
  { key: "later", title: "Later" },
];

/** Home card: all school assignments as a Today / This Week / Later board. */
export function SchoolAssignments() {
  const { data, loading, error, reload } = useResource<TaskDTO[]>(
    "/api/tasks?domain=school",
  );
  const tasks = data ?? [];
  const open = tasks.filter((t) => !t.done).length;

  async function toggle(task: TaskDTO) {
    await sendJSON(`/api/tasks/${task.id}`, "PATCH", { done: !task.done });
    reload();
  }

  return (
    <Panel title="School · Assignments" meta={loading ? "…" : `${open} open`}>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && tasks.length === 0 ? (
        <EmptyState>Nothing due right now. Add assignments in School — or just tell the Telegram bot.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.urgency === col.key);
            return (
              <div key={col.key} className="flex flex-col">
                <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-3">
                  <span>{col.title}</span>
                  <span className="font-mono">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="py-2 text-xs italic text-ink-3/70">—</div>
                ) : (
                  <ul className="flex flex-col">
                    {items.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-start gap-2 border-t border-white/[0.05] py-2 first:border-t-0"
                      >
                        <button
                          type="button"
                          onClick={() => toggle(task)}
                          aria-label={task.done ? "Mark not done" : "Mark done"}
                          className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${
                            task.done
                              ? "border-ember/40 bg-ember/30"
                              : "border-white/15 hover:border-ember/40"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            title={task.title}
                            className={`break-words text-xs leading-snug line-clamp-2 ${
                              task.done ? "text-ink-3 line-through" : "text-ink-4"
                            }`}
                          >
                            {task.title}
                          </div>
                          {task.course_name ? (
                            <div className="mt-1">
                              <Tag label={courseCode(task.course_name)} />
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

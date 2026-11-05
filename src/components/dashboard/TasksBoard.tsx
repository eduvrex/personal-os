"use client";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { TaskItem } from "@/components/dashboard/TaskItem";
import { AddTaskInline } from "@/components/dashboard/AddTaskInline";
import { useResource } from "@/lib/api";
import { effectiveLane } from "@/lib/taskLane";
import { formatMinutes } from "@/lib/format";
import type { TaskDTO, Urgency } from "@/lib/types";

/**
 * The Tasks tab: every open task across every domain in one trustworthy list.
 * Grouped by urgency lane — school tasks appear here too (tagged), because a
 * list that hides things cannot be trusted; the School tab remains the
 * coursework-focused HQ.
 */

const LANES: { key: Urgency; title: string; empty: string }[] = [
  { key: "today", title: "Today", empty: "Nothing for today — nice." },
  { key: "week", title: "This week", empty: "Nothing queued for this week." },
  { key: "later", title: "Later", empty: "Nothing parked for later." },
  { key: "inbox", title: "Inbox — unplanned", empty: "Inbox zero." },
];

/** Key tasks first, then nearest deadline, then oldest first. */
function laneSort(a: TaskDTO, b: TaskDTO): number {
  if (a.key !== b.key) return a.key ? -1 : 1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date)
    return a.due_date.localeCompare(b.due_date);
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  return a.created_at.localeCompare(b.created_at);
}

export function TasksBoard() {
  const { data, loading, error, reload } = useResource<TaskDTO[]>(
    "/api/tasks?status=open",
  );
  const open = data ?? [];
  const totalMin = open.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);

  if (error && !data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Panel title="Tasks">
          <ErrorNote message={error} onRetry={reload} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="px-1 text-xs text-ink-3">
        Everything open, in one place — school included. Tags say where each
        task belongs{totalMin ? ` · ~${formatMinutes(totalMin)} of estimated work open` : ""}.
      </p>

      {LANES.map((lane) => {
        const items = open.filter((t) => effectiveLane(t) === lane.key).sort(laneSort);
        return (
          <Panel
            key={lane.key}
            title={lane.title}
            meta={loading ? "…" : `${items.length} open`}
          >
            {loading ? null : items.length === 0 ? (
              <EmptyState>{lane.empty}</EmptyState>
            ) : (
              <ul className="flex flex-col">
                {items.map((task) => (
                  <TaskItem key={task.id} task={task} onChange={reload} wrap />
                ))}
              </ul>
            )}
            <AddTaskInline
              defaults={{ domain: "personal", urgency: lane.key }}
              onAdded={reload}
              placeholder={`Add to ${lane.title.toLowerCase().replace(" — unplanned", "")}…`}
            />
          </Panel>
        );
      })}
    </div>
  );
}

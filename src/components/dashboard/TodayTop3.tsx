"use client";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { TaskItem } from "@/components/dashboard/TaskItem";
import { AddTaskInline } from "@/components/dashboard/AddTaskInline";
import { useResource } from "@/lib/api";
import { formatMinutes } from "@/lib/format";
import { effectiveLane } from "@/lib/taskLane";
import type { TaskDTO } from "@/lib/types";

/** Home card: today's tasks, ranked key-first, with toggle / add / delete. */
export function TodayTop3() {
  const { data, loading, error, reload } = useResource<TaskDTO[]>(
    "/api/tasks?status=open",
  );
  // Today = anything triaged into the Today lane OR dated today/overdue, so
  // coursework loaded months ahead surfaces on its day without re-filing.
  const tasks = (data ?? []).filter((t) => effectiveLane(t) === "today");
  // Same fetch feeds both panels, so a task can never show as unplanned here
  // while the Tasks tab has already filed it by date.
  const inbox = (data ?? []).filter((t) => effectiveLane(t) === "inbox");
  const inboxLoading = loading;
  const inboxError = error;
  const inboxData = data;
  const reloadInbox = reload;
  const remaining = tasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);

  const meta = loading
    ? "…"
    : `${tasks.length} due${remaining ? ` · ${formatMinutes(remaining)} left` : ""}`;

  return (
    <>
      <Panel title="Task Inbox" meta={inboxLoading ? "…" : `${inbox.length} unplanned`}>
        {inboxError && !inboxData ? (
          <ErrorNote message={inboxError} onRetry={reloadInbox} />
        ) : !inboxLoading && inbox.length === 0 ? (
          <EmptyState>No unplanned tasks.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {inbox.map((task) => (
              <TaskItem key={task.id} task={task} onChange={reloadInbox} />
            ))}
          </ul>
        )}
        <AddTaskInline
          defaults={{ domain: "personal", urgency: "inbox" }}
          onAdded={reloadInbox}
          placeholder="Add something to plan later…"
        />
      </Panel>
      <Panel title="Today's Tasks" meta={meta}>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && tasks.length === 0 ? (
        <EmptyState>Nothing for today — nice.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} onChange={reload} />
          ))}
        </ul>
      )}
      <AddTaskInline
        defaults={{ domain: "personal", urgency: "today" }}
        onAdded={reload}
        placeholder="Add a task for today…"
      />
      </Panel>
    </>
  );
}

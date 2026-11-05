"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { TaskItem } from "@/components/dashboard/TaskItem";
import { AddTaskInline } from "@/components/dashboard/AddTaskInline";
import { sendJSON, useResource } from "@/lib/api";
import type { AkrovEmailDTO, TaskDTO, Urgency } from "@/lib/types";

/**
 * Akrov HQ: the venture's inbound email feed (forwarded from the Akrov Gmail
 * via /api/akrov/ingest) and every akrov-domain task, in one place.
 */

const LANES: { key: Urgency; title: string; empty: string }[] = [
  { key: "today", title: "Today", empty: "Nothing for today." },
  { key: "week", title: "This week", empty: "Nothing queued this week." },
  { key: "later", title: "Later", empty: "Nothing parked for later." },
  { key: "inbox", title: "Inbox — unplanned", empty: "Inbox zero." },
];

function laneSort(a: TaskDTO, b: TaskDTO): number {
  if (a.key !== b.key) return a.key ? -1 : 1;
  if (a.due_date && b.due_date && a.due_date !== b.due_date)
    return a.due_date.localeCompare(b.due_date);
  if (a.due_date && !b.due_date) return -1;
  if (!a.due_date && b.due_date) return 1;
  return a.created_at.localeCompare(b.created_at);
}

export function AkrovBoard() {
  const {
    data: tasks,
    loading,
    error,
    reload,
  } = useResource<TaskDTO[]>("/api/tasks?domain=akrov&status=open");

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <EmailInbox onConverted={reload} />

      {error && !tasks ? (
        <Panel title="Tasks">
          <ErrorNote message={error} onRetry={reload} />
        </Panel>
      ) : (
        LANES.map((lane) => {
          const items = (tasks ?? [])
            .filter((t) => (t.urgency ?? "inbox") === lane.key)
            .sort(laneSort);
          // Collapse empty non-primary lanes into nothing? No — predictable
          // structure beats cleverness; every lane always renders.
          return (
            <Panel key={lane.key} title={lane.title} meta={loading ? "…" : `${items.length} open`}>
              {loading ? null : items.length === 0 ? (
                <EmptyState>{lane.empty}</EmptyState>
              ) : (
                <ul className="flex flex-col">
                  {items.map((task) => (
                    <TaskItem key={task.id} task={task} onChange={reload} wrap showTag={false} />
                  ))}
                </ul>
              )}
              <AddTaskInline
                defaults={{ domain: "akrov", urgency: lane.key }}
                onAdded={reload}
                placeholder={`Add to ${lane.title.toLowerCase().replace(" — unplanned", "")}…`}
              />
            </Panel>
          );
        })
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Email feed
// ---------------------------------------------------------------------------

function EmailInbox({ onConverted }: { onConverted: () => void }) {
  const { data, loading, error, reload } = useResource<AkrovEmailDTO[]>("/api/akrov/emails");
  const items = data ?? [];

  return (
    <Panel title="Email feed" meta={loading ? "…" : `${items.length} new`}>
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && items.length === 0 ? (
        <EmptyState>
          Nothing new from the Akrov inbox. Mail lands here once the forwarder
          is connected — each item can become a task or be dismissed.
        </EmptyState>
      ) : (
        <ul className="flex flex-col">
          {items.map((m) => (
            <EmailRow key={m.id} item={m} onDone={reload} onConverted={onConverted} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function EmailRow({
  item,
  onDone,
  onConverted,
}: {
  item: AkrovEmailDTO;
  onDone: () => void;
  onConverted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(action: "task" | "dismiss") {
    setBusy(true);
    try {
      await sendJSON(`/api/akrov/emails/${item.id}`, "PATCH", { action });
      onDone();
      if (action === "task") onConverted();
    } finally {
      setBusy(false);
    }
  }

  const when = item.date
    ? new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <li className="group flex items-start gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="break-words text-sm leading-snug text-ink-4">{item.subject}</div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] text-ink-3">
          {item.from ? <span className="break-all">{item.from}</span> : null}
          {when ? <span className="text-faint">{when}</span> : null}
        </div>
        {item.snippet ? (
          <p className="mt-1 break-words text-[11px] leading-snug text-ink-3 line-clamp-2">
            {item.snippet}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("task")}
          className="rounded-[2px] border border-ember/30 bg-ember/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          → task
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("dismiss")}
          aria-label="Dismiss"
          className="text-ink-3 transition-colors hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      </div>
    </li>
  );
}

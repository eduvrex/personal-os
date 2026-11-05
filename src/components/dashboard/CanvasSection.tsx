"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { sendJSON, useResource } from "@/lib/api";
import type { CanvasAssignmentDTO, CanvasCourseDTO } from "@/lib/types";

interface CanvasResponse {
  configured: boolean;
  courses: CanvasCourseDTO[];
}

const KIND_BADGE: Record<CanvasAssignmentDTO["kind"], { label: string; cls: string }> = {
  assignment: { label: "hw", cls: "bg-white/[0.06] text-ink-3" },
  quiz: { label: "quiz", cls: "bg-danger/15 text-danger" },
  exam: { label: "exam", cls: "bg-danger/15 text-danger" },
  project: { label: "project", cls: "bg-warn/15 text-warn" },
};

function dueLabel(iso: string | null): { text: string; urgent: boolean } {
  if (!iso) return { text: "no due date", urgent: false };
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const date = due.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days < 0) return { text: `${date} · past due`, urgent: true };
  if (days === 0) return { text: `today`, urgent: true };
  if (days <= 7) return { text: `${date} · ${days}d`, urgent: days <= 2 };
  return { text: date, urgent: false };
}

/** Live Canvas mirror: courses, grades, upcoming work. Read-only. */
export function CanvasSection() {
  const { data, reload } = useResource<CanvasResponse>("/api/canvas");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Not configured and nothing mirrored → stay out of the way entirely.
  if (!data || (!data.configured && data.courses.length === 0)) return null;

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    try {
      await sendJSON("/api/canvas/sync", "POST");
      reload();
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Panel
      title="Canvas"
      meta={
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/30 hover:text-ember disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      }
    >
      {syncError ? (
        <div className="mb-3 rounded-[3px] border border-danger/20 bg-danger/[0.06] px-3 py-2 text-xs text-danger">
          {syncError}
        </div>
      ) : null}

      {data.courses.length === 0 ? (
        <EmptyState>
          Canvas is connected — hit Sync now (it also runs every morning).
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function CourseCard({ course }: { course: CanvasCourseDTO }) {
  const [showDone, setShowDone] = useState(false);
  const upcoming = course.assignments
    .filter((a) => !a.submitted)
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const done = course.assignments.filter((a) => a.submitted);

  return (
    <div className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink-4">{course.name}</div>
          <div className="text-[11px] text-ink-3">
            {course.code}
            {course.term ? ` · ${course.term}` : ""}
          </div>
        </div>
        {course.score != null || course.grade ? (
          <div className="shrink-0 rounded-[3px] bg-ember/10 px-2.5 py-1 text-right">
            <span className="font-mono text-sm text-ember">
              {course.grade ?? ""}
              {course.grade && course.score != null ? " · " : ""}
              {course.score != null ? `${course.score}%` : ""}
            </span>
          </div>
        ) : null}
      </div>

      {upcoming.length > 0 ? (
        <ul className="mt-2 flex flex-col">
          {upcoming.map((a) => {
            const due = dueLabel(a.dueAt);
            const badge = KIND_BADGE[a.kind];
            return (
              <li
                key={a.id}
                className="flex items-center gap-2 border-t border-white/[0.05] py-1.5 first:border-t-0"
              >
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${badge.cls}`}>
                  {badge.label}
                </span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate text-xs text-ink-4 hover:text-ember"
                  >
                    {a.name}
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-4">{a.name}</span>
                )}
                <span className={`shrink-0 font-mono text-[11px] ${due.urgent ? "text-warn" : "text-ink-3"}`}>
                  {due.text}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-2 text-xs text-ink-3">All caught up here 🎉</div>
      )}

      {done.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="mt-2 text-[11px] text-ink-3 hover:text-ember"
        >
          {showDone ? "▾" : "▸"} {done.length} submitted
        </button>
      ) : null}
      {showDone ? (
        <ul className="mt-1 flex flex-col">
          {done.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1 text-xs text-ink-3">
              <span className="text-ok">✓</span>
              <span className="min-w-0 flex-1 truncate line-through">{a.name}</span>
              {a.graded && a.score != null ? (
                <span className="font-mono">
                  {a.score}
                  {a.points != null ? `/${a.points}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";

import { Tag, toneFor } from "@/components/ui/Tag";
import { CheckIcon, StarIcon } from "@/components/icons";
import { sendJSON } from "@/lib/api";
import { courseCode, formatMinutes } from "@/lib/format";
import type { TaskDTO } from "@/lib/types";

interface TaskItemProps {
  task: TaskDTO;
  /** Called after a successful toggle/delete so the parent can re-fetch. */
  onChange: () => void;
  /** Show the course / Personal tag (hidden when the list is already grouped by course). */
  showTag?: boolean;
  /**
   * Roomy two-line layout: the title gets the full width and wraps, with the
   * tag / star / estimate / due chips on their own row beneath. Used by the
   * School board, where titles are long and legibility beats density.
   */
  wrap?: boolean;
}

/** A single task row: checkbox, title, optional course tag, key star, estimate, delete. */
export function TaskItem({
  task,
  onChange,
  showTag = true,
  wrap = false,
}: TaskItemProps) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await sendJSON(`/api/tasks/${task.id}`, "PATCH", { done: !task.done });
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await sendJSON(`/api/tasks/${task.id}`, "DELETE");
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const estimate = formatMinutes(task.time_estimate_min);
  const deadline = task.due_date
    ? `${task.due_date.slice(5)}${task.due_time ? ` ${task.due_time.slice(0, 5)}` : ""}`
    : null;
  const tagLabel = task.course_name
    ? courseCode(task.course_name)
    : task.domain && task.domain !== "personal"
      ? task.domain
      : "Personal";
  const tagTone = task.domain === "school" ? undefined : toneFor(task.domain ?? "");

  const checkbox = (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={task.done ? "Mark not done" : "Mark done"}
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px] border transition-colors disabled:opacity-50 ${
        wrap ? "mt-px" : ""
      } ${
        task.done
          ? "border-ember/40 bg-ember/20 text-ember"
          : "border-white/15 text-transparent hover:border-ember/40"
      }`}
    >
      <CheckIcon className="text-[12px]" />
    </button>
  );

  const deleteButton = (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label="Delete task"
      className={`shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:opacity-50 ${
        wrap ? "mt-px leading-none" : ""
      }`}
    >
      ×
    </button>
  );

  // Roomy: title on its own line, metadata chips beneath.
  if (wrap) {
    const hasMeta = showTag || task.key || Boolean(estimate) || Boolean(deadline);
    return (
      <li className="group flex items-start gap-3 border-t border-white/[0.05] py-3 first:border-t-0">
        {checkbox}
        <div className="min-w-0 flex-1">
          <span
            className={`block break-words text-sm leading-snug ${
              task.done ? "text-ink-3 line-through" : "text-ink-4"
            }`}
          >
            {task.title}
          </span>
          {hasMeta ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {showTag ? (
                <Tag
                  label={tagLabel}
                  kind={task.domain === "school" ? "course" : "personal"}
                  tone={tagTone}
                />
              ) : null}
              {task.key ? (
                <StarIcon filled className="text-[12px] text-warn" />
              ) : null}
              {deadline ? (
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                  due {deadline}
                </span>
              ) : null}
              {estimate ? (
                <span className="font-mono text-[10px] text-faint">{estimate}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {deleteButton}
      </li>
    );
  }

  // Dense layout (Home widgets, other boards): single line where the row is
  // wide enough; on narrow rows the meta chips wrap below the title instead
  // of squeezing it into an ellipsis.
  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-white/[0.05] py-2.5 first:border-t-0">
      {checkbox}

      <span
        title={task.title}
        className={`min-w-0 flex-1 basis-[11rem] break-words text-sm leading-snug line-clamp-2 ${
          task.done ? "text-ink-3 line-through" : "text-ink-4"
        }`}
      >
        {task.title}
      </span>

      <span className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
        {showTag ? (
          <Tag
            label={tagLabel}
            kind={task.domain === "school" ? "course" : "personal"}
            tone={tagTone}
          />
        ) : null}

        {task.key ? (
          <StarIcon filled className="shrink-0 text-[13px] text-warn" />
        ) : null}

        {estimate ? (
          <span className="shrink-0 font-mono text-xs text-ink-3">{estimate}</span>
        ) : null}
        {deadline ? (
          <span className="shrink-0 font-mono text-[10px] text-ink-3">due {deadline}</span>
        ) : null}

        {deleteButton}
      </span>
    </li>
  );
}

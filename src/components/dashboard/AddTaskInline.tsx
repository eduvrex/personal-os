"use client";

import { useState } from "react";

import { sendJSON } from "@/lib/api";
import type { Domain, Urgency } from "@/lib/types";

interface AddTaskInlineProps {
  /** Defaults applied to every task added through this input. */
  defaults?: { domain?: Domain; urgency?: Urgency; course_id?: string };
  onAdded: () => void;
  placeholder?: string;
}

/** A subtle always-visible "add a task" input row. Enter submits. */
export function AddTaskInline({
  defaults = {},
  onAdded,
  placeholder = "Add a task…",
}: AddTaskInlineProps) {
  const [value, setValue] = useState("");
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = value.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/tasks", "POST", {
        title,
        ...(due ? { due_date: due } : {}),
        ...(due && dueTime ? { due_time: dueTime } : {}),
        ...defaults,
      });
      setValue("");
      setDue("");
      setDueTime("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-2 flex items-center gap-2 rounded-[3px] border border-dashed border-white/[0.08] px-2.5 py-2 focus-within:border-ember/30"
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
      <input
        type="date"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        disabled={busy}
        aria-label="Due date"
        title="Due date (optional)"
        className="shrink-0 bg-transparent text-xs text-ink-3 focus:text-ink-4 focus:outline-none"
      />
      {due ? (
        <input
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
          disabled={busy}
          aria-label="Due time"
          title="Due time (optional)"
          className="w-[5.5rem] shrink-0 bg-transparent text-xs text-ink-3 focus:text-ink-4 focus:outline-none"
        />
      ) : null}
    </form>
  );
}

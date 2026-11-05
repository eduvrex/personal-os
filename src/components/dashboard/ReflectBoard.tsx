"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { SparkIcon } from "@/components/icons";
import { sendJSON, useResource } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import type { JournalDTO } from "@/lib/types";

const MOODS = ["😃", "🙂", "😐", "😪"];

/** Reflect tab: write a journal entry, summarize the day, browse past entries. */
export function ReflectBoard() {
  const { data, loading, error, reload } = useResource<JournalDTO[]>(
    "/api/journal?days=30",
  );
  const [text, setText] = useState("");
  const [mood, setMood] = useState("🙂");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const entries = data ?? [];

  async function add() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/journal", "POST", {
        text: t,
        mood,
        source: "text",
        private: isPrivate,
      });
      setText("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function togglePrivate(entry: JournalDTO) {
    await sendJSON(`/api/journal/${entry.id}`, "PATCH", { private: !entry.private });
    reload();
  }

  async function summarize() {
    setSummarizing(true);
    try {
      const res = await sendJSON<{ summary: string }>(
        "/api/journal/summarize",
        "POST",
      );
      setSummary(res.summary);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Panel
        title="Reflect · Journal"
        meta={
          <button
            type="button"
            onClick={summarize}
            disabled={summarizing}
            className="flex items-center gap-1.5 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/30 hover:text-ember disabled:opacity-50"
          >
            <SparkIcon className="text-[12px]" />
            {summarizing ? "Summarizing…" : "Summarize my day"}
          </button>
        }
      >
        {summary ? (
          <div className="mb-3 rounded-[3px] border border-ember/20 bg-ember/[0.06] p-3 text-sm leading-relaxed text-ink-4">
            <span className="font-medium text-ember">Your day, summarized: </span>
            {summary}
          </div>
        ) : null}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How did today go?"
          rows={3}
          className="w-full resize-y rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
          >
            Add entry
          </button>
          <span className="text-xs text-ink-3">Mood:</span>
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              className={`rounded-[3px] border px-2 py-1 text-base transition-colors ${
                mood === m
                  ? "border-ember/40 bg-ember/10"
                  : "border-white/[0.08] hover:border-white/20"
              }`}
            >
              {m}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setIsPrivate((v) => !v)}
            className={`ml-auto rounded-[3px] border px-2.5 py-1 text-xs transition-colors ${
              isPrivate
                ? "border-ember/40 bg-ember/10 text-ember"
                : "border-white/[0.08] text-ink-3 hover:border-white/20"
            }`}
            title="Private entries are hidden from the Home preview"
          >
            {isPrivate ? "🔒 Private" : "Mark private"}
          </button>
        </div>
      </Panel>

      <Panel title="Past entries" meta={loading ? "…" : `${entries.length}`}>
        {error && !data ? (
          <ErrorNote message={error} onRetry={reload} />
        ) : !loading && entries.length === 0 ? (
          <EmptyState>No entries yet — write your first above.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2.5">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[3px] border border-white/[0.05] bg-white/[0.02] p-3"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-ink-3">
                  <span>
                    {formatEntryDate(entry.entry_date)}
                    {entry.source ? ` · ${entry.source}` : ""}
                    {entry.private ? (
                      <span className="ml-1 text-ember">· 🔒 private</span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => togglePrivate(entry)}
                      className="text-ink-3 hover:text-ember"
                    >
                      {entry.private ? "Make public" : "Make private"}
                    </button>
                    {entry.mood ? <span className="text-base">{entry.mood}</span> : null}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-ink-4">{entry.text}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

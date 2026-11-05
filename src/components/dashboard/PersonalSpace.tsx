"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import type { JournalDTO } from "@/lib/types";

const MOODS = ["😃", "🙂", "😐", "😔", "😪"];

/** Private, low-key space for check-ins + a supportive "talk it through" box. */
export function PersonalSpace() {
  const { data, error: loadError, reload } = useResource<JournalDTO[]>("/api/personal/journal");
  const entries = data ?? [];

  const [text, setText] = useState("");
  const [mood, setMood] = useState("🙂");
  const [busy, setBusy] = useState(false);

  const [thought, setThought] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  async function saveCheckIn() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/personal/journal", "POST", { text: t, mood });
      setText("");
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function talk() {
    const t = thought.trim();
    if (!t || thinking) return;
    setThinking(true);
    setReply(null);
    try {
      const res = await sendJSON<{ reply: string }>("/api/personal/support", "POST", {
        text: t,
      });
      setReply(res.reply);
    } catch (e) {
      setReply(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  return (
    <Panel title="Personal" meta={<span className="text-ink-3/70">private · just for you</span>}>
      <p className="-mt-1 mb-3 text-xs text-ink-3/80">
        A calm, private space. Nothing here appears in your Home cards, the memory
        search, or the assistant&apos;s nudges.
      </p>

      {/* Check-in */}
      <div className="rounded-[3px] border border-white/[0.05] bg-white/[0.015] p-3">
        <div className="mb-2 flex items-center gap-1.5">
          {MOODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMood(m)}
              className={`rounded-[3px] border px-2 py-1 text-base transition-colors ${
                mood === m ? "border-ember/30 bg-ember/[0.08]" : "border-white/[0.06] hover:border-white/15"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="How are you, really?"
          className="w-full resize-y rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={saveCheckIn}
          disabled={busy}
          className="mt-2 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-ink-4 transition-colors hover:border-ember/30 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save check-in"}
        </button>
      </div>

      {/* Talk it through */}
      <div className="mt-3 rounded-[3px] border border-white/[0.05] bg-white/[0.015] p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-3">
          Talk it through
        </div>
        <textarea
          value={thought}
          onChange={(e) => setThought(e.target.value)}
          rows={3}
          placeholder="Write what's on your mind…"
          className="w-full resize-y rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={talk}
          disabled={thinking}
          className="mt-2 rounded-[3px] border border-ember/20 bg-ember/[0.08] px-4 py-2 text-sm text-ember transition-colors hover:bg-ember/15 disabled:opacity-50"
        >
          {thinking ? "…" : "Talk it through"}
        </button>
        {reply ? (
          <div className="mt-3 whitespace-pre-wrap rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3 text-sm leading-relaxed text-ink-3">
            {reply}
          </div>
        ) : null}
      </div>

      {/* Past check-ins */}
      <div className="mt-3">
        {loadError && !data ? (
          <ErrorNote message={loadError} onRetry={reload} />
        ) : entries.length === 0 ? (
          <EmptyState>No check-ins yet. This space is just yours.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((e) => (
              <div key={e.id} className="rounded-[3px] border border-white/[0.05] bg-white/[0.015] p-2.5">
                <div className="mb-1 flex items-center justify-between text-[11px] text-ink-3">
                  <span>{formatEntryDate(e.entry_date)}</span>
                  {e.mood ? <span className="text-base">{e.mood}</span> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm text-ink-3">{e.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}

"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { sendJSON } from "@/lib/api";

/**
 * Money Q&A grounded in real data. Requires the debt screen unlocked; each
 * question is a paid (API) call, so it's labeled and never runs on load.
 */
export function AdvisorPanel({ locked }: { locked: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await sendJSON<{ answer: string }>("/api/advisor", "POST", {
        question: q,
      });
      setAnswer(res.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Money questions" meta="paid AI action">
      <p className="-mt-1 mb-3 text-xs text-ink-3">
        Ask things like “I have an extra $200 — what are my options?” Answers
        use your real balances, APRs, budgets, and deadlines, and lay out
        trade-offs. Never advice, never a single directive.
      </p>

      {locked ? (
        <div className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-ink-3">
          🔒 Unlock the debt screen above first — these answers necessarily
          discuss your debt.
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask about your money…"
              className="flex-1 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={ask}
              disabled={busy || !question.trim()}
              className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
            >
              {busy ? "Thinking…" : "Ask ($)"}
            </button>
          </div>
          {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}
          {answer ? (
            <div className="mt-3 whitespace-pre-wrap rounded-[3px] border border-white/[0.05] bg-white/[0.02] p-3 text-sm leading-relaxed text-ink-4">
              {answer}
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

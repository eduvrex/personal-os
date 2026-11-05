"use client";

import { useEffect, useRef, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchIcon, SparkIcon } from "@/components/icons";
import { sendJSON } from "@/lib/api";
import type { AskResponseDTO, MemoryHitDTO } from "@/lib/types";

/** Brain tab: live search over the memory layer + an "Ask my OS" box. */
export function BrainBoard() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <SearchPanel />
      <AskPanel />
    </div>
  );
}

function SearchPanel() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHitDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  // Debounced live search as you type.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const handle = setTimeout(async () => {
      try {
        const res = await sendJSON<{ results: MemoryHitDTO[] }>(
          "/api/memory/search",
          "POST",
          { query: q },
        );
        if (id === reqId.current) setHits(res.results ?? []);
      } catch {
        if (id === reqId.current) setHits([]);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <Panel title="Brain · Search">
      <div className="flex items-center gap-2 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
        <SearchIcon className="text-[15px] text-ink-3" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything you've captured…"
          className="w-full bg-transparent text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
        />
      </div>

      <div className="mt-3">
        {query.trim() && !searching && hits.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <ul className="flex flex-col">
            {hits.map((hit) => (
              <li
                key={hit.documentId}
                className="border-t border-white/[0.05] py-2.5 first:border-t-0"
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ember">
                  <span className="h-1 w-1 rounded-full bg-ember" />
                  {hit.sourceLabel}
                </div>
                <p className="text-sm leading-snug text-ink-4">{hit.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function AskPanel() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskResponseDTO | null>(null);
  const [asking, setAsking] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setAnswer(null);
    try {
      const res = await sendJSON<AskResponseDTO>("/api/ask", "POST", {
        question: q,
      });
      setAnswer(res);
    } catch (err) {
      setAnswer({
        answer: err instanceof Error ? err.message : "Something went wrong.",
        sources: [],
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <Panel title="Ask my OS">
      <form onSubmit={ask} className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your notes…"
          className="w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <button
          type="submit"
          disabled={asking}
          className="flex shrink-0 items-center gap-1.5 rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2.5 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          <SparkIcon className="text-[14px]" />
          {asking ? "…" : "Ask"}
        </button>
      </form>

      {answer ? (
        <div className="mt-3">
          <div className="rounded-[3px] border border-ember/20 bg-ember/[0.06] p-3 text-sm leading-relaxed text-ink-4">
            {answer.answer}
          </div>
          {answer.sources.length > 0 ? (
            <div className="mt-3">
              <div className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-3">
                Sources
              </div>
              <ul className="flex flex-col gap-1.5">
                {answer.sources.map((src, i) => (
                  <li key={i} className="flex gap-2 text-xs text-ink-3">
                    <span className="shrink-0 font-mono text-ember">
                      [{src.label}]
                    </span>
                    <span className="line-clamp-2">{src.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

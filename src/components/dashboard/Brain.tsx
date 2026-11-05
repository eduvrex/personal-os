"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { SearchIcon } from "@/components/icons";
import { sendJSON, useResource } from "@/lib/api";
import type { MemoryHitDTO } from "@/lib/types";

interface CaptureItem {
  id: string;
  text: string | null;
  routed_to: string | null;
  created_at: string;
}
interface CapturesResponse {
  count: number;
  items: CaptureItem[];
}

/** Home card: inline memory search + recent captures. */
export function Brain() {
  const { data, loading, error, reload } = useResource<CapturesResponse>("/api/captures?limit=4");
  const items = data?.items ?? [];

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHitDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

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
          { query: q, limit: 5 },
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

  const showingSearch = query.trim().length > 0;

  return (
    <Panel title="Brain" meta={loading ? "…" : `${data?.count ?? 0} captured`}>
      <div className="flex items-center gap-2 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
        <SearchIcon className="text-[15px] text-ink-3" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your memory…"
          className="w-full bg-transparent text-sm text-ink-4 placeholder:text-ink-3 focus:outline-none"
        />
      </div>

      {showingSearch ? (
        !searching && hits.length === 0 ? (
          <div className="mt-3">
            <EmptyState>No matches.</EmptyState>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col">
            {hits.map((h) => (
              <li key={h.documentId} className="border-t border-white/[0.05] py-2.5 first:border-t-0">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ember">
                  <span className="h-1 w-1 rounded-full bg-ember" />
                  {h.sourceLabel}
                </div>
                <p className="line-clamp-2 text-sm leading-snug text-ink-4">{h.text}</p>
              </li>
            ))}
          </ul>
        )
      ) : error && !data ? (
        <div className="mt-3">
          <ErrorNote message={error} onRetry={reload} />
        </div>
      ) : !loading && items.length === 0 ? (
        <div className="mt-3">
          <EmptyState>Type anything in the bar below — tasks, ideas, feelings. It all lands here, sorted.</EmptyState>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col">
          {items.map((item, i) => (
            <li key={item.id} className={`py-2.5 ${i > 0 ? "border-t border-white/[0.05]" : ""}`}>
              <p className="line-clamp-2 text-sm leading-snug text-ink-4">{item.text}</p>
              {item.routed_to ? (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-3">
                  <span className="h-1 w-1 rounded-full bg-ember" />
                  {item.routed_to}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/brain"
        className="mt-3 inline-block text-xs text-ink-3 transition-colors hover:text-ember"
      >
        Open Brain →
      </Link>
    </Panel>
  );
}

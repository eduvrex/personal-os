"use client";

import Link from "next/link";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { ArrowRightIcon } from "@/components/icons";
import { useResource } from "@/lib/api";
import { formatEntryDate } from "@/lib/format";
import type { JournalDTO } from "@/lib/types";

/** Home card: latest journal entry + link into the Reflect tab. */
export function Reflect() {
  const { data, loading, error, reload } = useResource<JournalDTO[]>("/api/journal?days=30");
  // Never surface private entries on Home.
  const latest = (data ?? []).find((e) => !e.private);

  return (
    <Panel
      title="Reflect"
      meta={latest ? formatEntryDate(latest.entry_date) : undefined}
    >
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && !latest ? (
        <EmptyState>No entries yet — how was today, really?</EmptyState>
      ) : latest ? (
        <>
          <div className="mb-2 flex items-center gap-2">
            {latest.mood ? (
              <span className="text-base">{latest.mood}</span>
            ) : null}
            <span className="text-[10px] uppercase tracking-wider text-ink-3">
              Latest entry
            </span>
          </div>
          <p className="line-clamp-4 text-sm leading-relaxed text-ink-3">
            {latest.text}
          </p>
        </>
      ) : null}

      <Link
        href="/reflect"
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-[3px] border border-white/[0.08] bg-white/[0.03] py-2.5 text-sm text-ink-4 transition-colors hover:border-ember/30 hover:bg-ember/[0.06]"
      >
        Open journal
        <ArrowRightIcon className="text-[14px] text-ember" />
      </Link>
    </Panel>
  );
}

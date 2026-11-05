"use client";

import { Panel } from "@/components/ui/Panel";
import { useResource } from "@/lib/api";

interface Connections {
  telegram: boolean;
  plaid: boolean;
  canvas: boolean;
  gcal: boolean;
  memory: boolean;
}

const ROWS: {
  key: keyof Connections;
  name: string;
  detail: string;
}[] = [
  { key: "telegram", name: "Telegram capture", detail: "Voice notes & texts become tasks, notes, and journal entries" },
  { key: "plaid", name: "Banks & cards (Plaid)", detail: "Balances and transactions, synced every morning" },
  { key: "canvas", name: "Canvas", detail: "Courses, assignments, and grades — read-only" },
  { key: "gcal", name: "Google Calendar", detail: "Read-only overlay on your Calendar" },
  { key: "memory", name: "Memory (Supermemory)", detail: "Powers Brain search & Ask-my-OS" },
];

/** What's wired up — plus the deliberately-deferred email integration. */
export function ConnectionsPanel() {
  const { data } = useResource<Connections>("/api/connections");

  return (
    <Panel title="Connections">
      <ul className="flex flex-col">
        {ROWS.map((row) => {
          const on = data ? data[row.key] : null;
          return (
            <li
              key={row.key}
              className="flex items-center gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0"
            >
              <span
                aria-hidden
                className={`h-2 w-2 shrink-0 rounded-full ${
                  on == null ? "bg-white/20" : on ? "bg-ok" : "bg-white/20"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink-4">{row.name}</div>
                <div className="truncate text-[11px] text-ink-3">{row.detail}</div>
              </div>
              <span className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3">
                {on == null ? "…" : on ? "Connected" : "Not set up"}
              </span>
            </li>
          );
        })}

        {/* W6 — deferred on purpose. */}
        <li className="flex items-center gap-3 border-t border-white/[0.05] py-2.5">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-white/20" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-ink-4">Email</div>
            <div className="text-[11px] text-ink-3">
              Coming later, on purpose — inbox access deserves its own careful,
              read-only design pass.
            </div>
          </div>
          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3">
            Later
          </span>
        </li>
      </ul>
    </Panel>
  );
}

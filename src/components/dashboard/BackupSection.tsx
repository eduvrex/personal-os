"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";

/** Me-tab: download a full JSON snapshot of every table. */
export function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `personal-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Backup" meta="your data">
      <p className="-mt-1 mb-3 text-xs text-ink-3">
        A full JSON snapshot of everything. A timestamped copy is also saved to
        private storage automatically each day (last 14 kept).
      </p>
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
      >
        {busy ? "Preparing…" : "Download backup"}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </Panel>
  );
}

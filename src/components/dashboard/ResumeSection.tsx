"use client";

import { useEffect, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { sendJSON, useResource } from "@/lib/api";
import type { ResumeDTO } from "@/lib/types";

/** Me-tab CV store: paste/replace the resume full text used as assistant context. */
export function ResumeSection() {
  const { data, reload } = useResource<ResumeDTO>("/api/resume");
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && text === null) setText(data.full_text ?? "");
  }, [data, text]);

  async function save() {
    if (text === null || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/resume", "PATCH", { full_text: text });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="CV / Résumé"
      meta={saved ? <span className="text-ember">saved ✓</span> : <span>context for drafts</span>}
    >
      <p className="-mt-1 mb-2 text-xs text-ink-3">
        Used as context when drafting tailored applications. Paste a newer CV any
        time to replace it.
      </p>
      <textarea
        value={text ?? ""}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder="Paste your CV text…"
        className="w-full resize-y rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 font-mono text-xs leading-relaxed text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
      />
      <div className="mt-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save CV"}
        </button>
      </div>
    </Panel>
  );
}

"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { sendJSON, useResource } from "@/lib/api";
import type { ApplicationDTO } from "@/lib/types";

interface TailorResponse {
  tailored_resume: string;
  cover_letter: string | null;
  applicationId: string | null;
}

/**
 * Paste a job posting → tailored CV (+ optional cover letter) as .docx.
 * Truthful-only tailoring; saves onto the chosen application; stops at
 * "Ready — review & send". Paid (API) action, labeled.
 */
export function TailorPanel() {
  const { data: apps, reload } = useResource<ApplicationDTO[]>("/api/applications");
  const [jd, setJd] = useState("");
  const [appId, setAppId] = useState("");
  const [cover, setCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailorResponse | null>(null);

  async function generate() {
    const text = jd.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await sendJSON<TailorResponse>("/api/resume/tailor", "POST", {
        jobDescription: text,
        applicationId: appId || null,
        includeCoverLetter: cover,
      });
      setResult(res);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Tailor my CV" meta="paid AI action">
      <p className="-mt-1 mb-3 text-xs text-ink-3">
        Paste a job posting (or LinkedIn text). Your stored CV gets reordered
        and re-emphasized for the role — <span className="text-ink-4">never
        invented</span> — and comes back as a Word file. Nothing is ever
        submitted for you.
      </p>

      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        rows={5}
        placeholder="Paste the job description here…"
        className="w-full resize-y rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          aria-label="Save onto application"
          className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 focus:border-ember/30 focus:outline-none"
        >
          <option value="">Save to… (optional)</option>
          {(apps ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {[a.org, a.title].filter(Boolean).join(" — ").slice(0, 60)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-3">
          <input
            type="checkbox"
            checked={cover}
            onChange={(e) => setCover(e.target.checked)}
            className="accent-ember"
          />
          Cover letter too
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !jd.trim()}
          className="ml-auto rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          {busy ? "Tailoring…" : "Tailor ($)"}
        </button>
      </div>

      {error ? <div className="mt-2 text-xs text-danger">{error}</div> : null}

      {result ? (
        <div className="mt-3 rounded-[3px] border border-ember/20 bg-ember/[0.05] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-ember/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ember">
              Ready — review &amp; send
            </span>
            {result.applicationId ? (
              <>
                <a
                  href={`/api/applications/${result.applicationId}/docx?doc=resume`}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-ink-4 hover:border-ember/30 hover:text-ember"
                >
                  ⬇ Resume .docx
                </a>
                {result.cover_letter ? (
                  <a
                    href={`/api/applications/${result.applicationId}/docx?doc=cover`}
                    className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-ink-4 hover:border-ember/30 hover:text-ember"
                  >
                    ⬇ Cover letter .docx
                  </a>
                ) : null}
                <span className="text-[11px] text-ink-3">saved to the application</span>
              </>
            ) : (
              <span className="text-[11px] text-ink-3">
                pick an application next time to get .docx downloads &amp; keep it saved
              </span>
            )}
          </div>
          <details>
            <summary className="cursor-pointer text-xs text-ink-3 hover:text-ember">
              Preview tailored resume
            </summary>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-4">
              {result.tailored_resume}
            </pre>
          </details>
          {result.cover_letter ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-ink-3 hover:text-ember">
                Preview cover letter
              </summary>
              <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-4">
                {result.cover_letter}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

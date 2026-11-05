"use client";

import { useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON, useResource } from "@/lib/api";
import type {
  ApplicationDTO,
  ApplicationKind,
  ApplicationStatus,
  JobEmailDTO,
} from "@/lib/types";

const COLUMNS: { key: ApplicationStatus; title: string }[] = [
  { key: "researching", title: "Researching" },
  { key: "applying", title: "Applying" },
  { key: "applied", title: "Applied" },
  { key: "interview", title: "Interview" },
  { key: "decision", title: "Decision" },
];

const KIND_LABEL: Record<ApplicationKind, string> = {
  masters: "Master's",
  job: "Job",
  campus_job: "Campus job",
};

/** Admissions realism chip — reach reads hot (rose), target reads calm (sky). */
function RealismChip({ realism }: { realism: ApplicationDTO["realism"] }) {
  if (!realism) return null;
  const styles =
    realism === "reach"
      ? "border-ember/30 bg-ember/10 text-ember"
      : realism === "target"
        ? "border-sky/30 bg-sky/10 text-sky"
        : "border-ok/30 bg-ok/10 text-ok";
  return (
    <span className={`shrink-0 rounded-[2px] border px-1 py-px font-mono text-[9px] uppercase tracking-[0.12em] ${styles}`}>
      {realism}
    </span>
  );
}

function deadlineLabel(a: ApplicationDTO): string {
  if (a.deadline) {
    const d = new Date(`${a.deadline}T00:00:00`);
    const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
    const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return days >= 0 && days <= 45 ? `${date} · ${days}d` : date;
  }
  return a.deadline_indicative ?? "rolling";
}

function isSoon(a: ApplicationDTO): boolean {
  if (!a.deadline) return false;
  const days = Math.round((Date.parse(`${a.deadline}T00:00:00`) - Date.now()) / 86_400_000);
  return days >= 0 && days <= 30;
}

// ---------------------------------------------------------------------------
// Job-search email feed
// ---------------------------------------------------------------------------

/**
 * Mail forwarded from the job-search Gmail account. Items matched to an
 * application on ingest carry that org, so a recruiter reply reads as
 * "UNIR — Re: your application" rather than an anonymous subject line.
 */
function JobEmailInbox({ onConverted }: { onConverted: () => void }) {
  const { data, loading, error, reload } = useResource<JobEmailDTO[]>("/api/jobs/emails");
  const items = data ?? [];
  const matched = items.filter((m) => m.matched_org).length;

  return (
    <Panel
      title="Job inbox"
      meta={loading ? "…" : `${items.length} new${matched ? ` · ${matched} matched` : ""}`}
    >
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !loading && items.length === 0 ? (
        <p className="text-xs text-ink-3">
          Nothing new. Mail sent to the job-search inbox lands here once the
          forwarder is connected; anything from a company you have applied to is
          tagged with that application.
        </p>
      ) : (
        <ul className="flex flex-col">
          {items.map((m) => (
            <JobEmailRow key={m.id} item={m} onDone={reload} onConverted={onConverted} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function JobEmailRow({
  item,
  onDone,
  onConverted,
}: {
  item: JobEmailDTO;
  onDone: () => void;
  onConverted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function act(action: "task" | "dismiss") {
    setBusy(true);
    try {
      await sendJSON(`/api/jobs/emails/${item.id}`, "PATCH", { action });
      onDone();
      if (action === "task") onConverted();
    } finally {
      setBusy(false);
    }
  }

  const when = item.date
    ? new Date(item.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <li className="group flex items-start gap-3 border-t border-white/[0.05] py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          {item.matched_org ? (
            <span className="shrink-0 rounded-[2px] border border-sky/30 bg-sky/10 px-1 py-px font-mono text-[9px] uppercase tracking-[0.12em] text-sky">
              {item.matched_org}
            </span>
          ) : null}
          <span className="break-words text-sm leading-snug text-ink-4">{item.subject}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] text-ink-3">
          {item.from ? <span className="break-all">{item.from}</span> : null}
          {when ? <span className="text-faint">{when}</span> : null}
        </div>
        {item.snippet ? (
          <p className="mt-1 break-words text-[11px] leading-snug text-ink-3 line-clamp-2">
            {item.snippet}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => act("task")}
          className="rounded-[2px] border border-ember/30 bg-ember/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          → task
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("dismiss")}
          aria-label="Dismiss"
          className="text-ink-3 transition-colors hover:text-danger disabled:opacity-50"
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function ApplicationsBoard() {
  const { data, loading, error, reload } = useResource<ApplicationDTO[]>("/api/applications");
  const apps = data ?? [];
  const [openId, setOpenId] = useState<string | null>(null);
  const selected = apps.find((a) => a.id === openId) ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Panel
        title="Applications"
        meta={`${apps.length} tracked`}
      >
        <p className="-mt-1 mb-3 text-xs text-ink-3">
          Master&apos;s programs and jobs. The assistant drafts and tracks — you
          review and submit. Nothing is ever sent for you.
        </p>
        <AddApplication onAdded={reload} />

        {error && !data ? (
          <div className="mt-3"><ErrorNote message={error} onRetry={reload} /></div>
        ) : loading ? null : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-5">
            {COLUMNS.map((col) => {
              const items = apps.filter((a) => a.status === col.key);
              return (
                <div key={col.key} className="flex flex-col">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-3">
                    <span>{col.title}</span>
                    <span className="font-mono">{items.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setOpenId(a.id)}
                        className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-left transition-colors hover:border-ember/30"
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span className="truncate text-xs font-medium text-ink-4">
                            {a.title}
                          </span>
                          <RealismChip realism={a.realism} />
                        </div>
                        <div className="truncate text-[11px] text-ink-3">{a.org}</div>
                        <div className="mt-1.5 flex items-center justify-between gap-1">
                          <span
                            className={`font-mono text-[10px] ${isSoon(a) ? "text-warn" : "text-ink-3"}`}
                          >
                            {deadlineLabel(a)}
                          </span>
                          <span className="rounded bg-white/[0.05] px-1 py-0.5 text-[9px] uppercase tracking-wide text-ink-3">
                            {KIND_LABEL[a.kind]}
                          </span>
                        </div>
                      </button>
                    ))}
                    {items.length === 0 ? (
                      <div className="py-1 text-[11px] italic text-ink-3/70">—</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <JobEmailInbox onConverted={reload} />

      {selected ? (
        <Drawer app={selected} onClose={() => setOpenId(null)} onChanged={reload} />
      ) : null}
    </div>
  );
}

function AddApplication({ onAdded }: { onAdded: () => void }) {
  const [org, setOrg] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ApplicationKind>("job");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if ((!org.trim() && !title.trim()) || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/applications", "POST", { org, title, kind, status: "researching" });
      setOrg("");
      setTitle("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none";

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input className={`flex-1 ${input}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title / role" />
      <input className={`${input} sm:w-44`} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Org" />
      <select className={input} value={kind} onChange={(e) => setKind(e.target.value as ApplicationKind)}>
        <option value="job">Job</option>
        <option value="campus_job">Campus job</option>
        <option value="masters">Master&apos;s</option>
      </select>
      <button type="submit" disabled={busy} className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember hover:bg-ember/20 disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

function Drawer({
  app,
  onClose,
  onChanged,
}: {
  app: ApplicationDTO;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafting, setDrafting] = useState(false);

  async function patch(p: Record<string, unknown>) {
    await sendJSON(`/api/applications/${app.id}`, "PATCH", p);
    onChanged();
  }
  async function draft() {
    setDrafting(true);
    try {
      await sendJSON(`/api/applications/${app.id}/draft`, "POST");
      onChanged();
    } finally {
      setDrafting(false);
    }
  }

  const input =
    "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none";
  const hasDrafts = !!(app.tailored_resume || app.cover_letter);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/50 backdrop-blur-sm" />
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-white/[0.08] bg-ink-1/95 p-5 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="flex items-baseline gap-2 text-base font-medium text-ink-4">
              {app.title}
              <RealismChip realism={app.realism} />
            </h2>
            <p className="text-sm text-ink-3">{app.org}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="text-ink-3 hover:text-ink-4">×</button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ink-3">
          {app.field ? <span className="rounded bg-white/[0.05] px-2 py-0.5">{app.field}</span> : null}
          {app.eu_tuition ? <span className="rounded bg-white/[0.05] px-2 py-0.5">{app.eu_tuition}</span> : null}
          {app.test_required ? <span className="rounded bg-white/[0.05] px-2 py-0.5">Test: {app.test_required}</span> : null}
          {app.url ? (
            <a href={app.url} target="_blank" rel="noreferrer" className="rounded bg-ember/10 px-2 py-0.5 text-ember hover:bg-ember/20">
              Open ↗
            </a>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            Status
            <select
              className={`mt-1 ${input}`}
              defaultValue={app.status}
              onChange={(e) => patch({ status: e.target.value })}
            >
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>{c.title}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-wider text-ink-3">
            Deadline
            <input
              type="date"
              className={`mt-1 ${input}`}
              defaultValue={app.deadline ?? ""}
              onBlur={(e) => { if (e.target.value !== (app.deadline ?? "")) patch({ deadline: e.target.value }); }}
            />
          </label>
        </div>
        {app.deadline_indicative ? (
          <p className="mt-1 text-[11px] text-ink-3">Indicative: {app.deadline_indicative}</p>
        ) : null}

        <Labeled label="Fit notes">
          <textarea className={`${input} resize-y`} rows={3} defaultValue={app.fit_notes ?? ""}
            onBlur={(e) => { if (e.target.value !== (app.fit_notes ?? "")) patch({ fit_notes: e.target.value }); }} />
        </Labeled>
        <Labeled label="Next action">
          <input className={input} defaultValue={app.next_action ?? ""}
            onBlur={(e) => { if (e.target.value !== (app.next_action ?? "")) patch({ next_action: e.target.value }); }} />
        </Labeled>

        <div className="mt-5 border-t border-white/[0.08] pt-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-ink-3">Tailored drafts</span>
            <button type="button" onClick={draft} disabled={drafting}
              className="rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember hover:bg-ember/20 disabled:opacity-50">
              {drafting ? "Drafting…" : hasDrafts ? "Redraft" : "Draft application"}
            </button>
          </div>

          {hasDrafts ? (
            <div className="flex flex-wrap gap-2">
              {app.tailored_resume ? (
                <a href={`/api/applications/${app.id}/docx?doc=resume`}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-ink-4 hover:border-ember/30 hover:text-ember">
                  ⬇ Resume .docx
                </a>
              ) : null}
              {app.cover_letter ? (
                <a href={`/api/applications/${app.id}/docx?doc=cover`}
                  className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-ink-4 hover:border-ember/30 hover:text-ember">
                  ⬇ Cover letter .docx
                </a>
              ) : null}
            </div>
          ) : null}
          {hasDrafts ? (
            <>
              <Labeled label="Tailored resume summary">
                <textarea className={`${input} resize-y font-mono text-xs`} rows={5} defaultValue={app.tailored_resume ?? ""}
                  onBlur={(e) => { if (e.target.value !== (app.tailored_resume ?? "")) patch({ tailored_resume: e.target.value }); }} />
              </Labeled>
              <Labeled label="Cover letter">
                <textarea className={`${input} resize-y font-mono text-xs`} rows={10} defaultValue={app.cover_letter ?? ""}
                  onBlur={(e) => { if (e.target.value !== (app.cover_letter ?? "")) patch({ cover_letter: e.target.value }); }} />
              </Labeled>
              <div className="mt-3 rounded-[3px] border border-ember/20 bg-ember/[0.06] px-3 py-2 text-xs text-ink-3">
                <span className="font-medium text-ember">Ready to submit — your move.</span>{" "}
                Review and edit the drafts, then apply on the program/role site yourself. The assistant never submits anything for you.
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-ink-3">
              Generate a tailored resume summary and cover letter from your stored CV. You review and submit — nothing is sent automatically.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      {children}
    </label>
  );
}

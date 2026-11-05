"use client";

import { useEffect, useRef, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { Tag } from "@/components/ui/Tag";
import { RhythmWeek } from "@/components/dashboard/RhythmWeek";
import { sendJSON, useResource } from "@/lib/api";
import type {
  MeditationStatsDTO,
  ReadingBookDTO,
  ReadingListDTO,
  ReadingStatus,
  RhythmBlockDTO,
} from "@/lib/types";

const inputCls =
  "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/40 focus:outline-none";
const labelCls = "text-[10px] uppercase tracking-wider text-ink-3";
const chipBtn =
  "rounded-[2px] border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-3 transition-colors hover:border-ember/40 hover:text-ember";

/**
 * The Rhythm surface:
 * a humane, editable daily routine plus the meditation and reading trackers.
 * Sustainable, not militant — every time and block is his to change.
 */
export function RhythmBoard() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <p className="px-1 text-xs text-ink-3">
        A humane routine — sustainable, not militant. Set your own times and blocks;
        these are only starting points.
      </p>
      <RhythmWeek />
      <RhythmEditor />
      <MeditationPanel />
      <ReadingPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rhythm editor.
// ---------------------------------------------------------------------------

const KIND_LABEL: Record<string, string> = {
  anchor: "anchor",
  focus: "focus",
  akrov: "akrov",
  meal: "meal",
  practice: "practice",
  "wind-down": "wind-down",
  review: "review",
  class: "class",
  work: "work",
  training: "training",
};

function RhythmEditor() {
  const { data, error, reload } = useResource<RhythmBlockDTO[]>("/api/rhythm");
  const [showForm, setShowForm] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const blocks = data ?? [];

  async function seed() {
    setSeeding(true);
    try {
      await sendJSON("/api/rhythm/defaults", "POST");
      reload();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Panel
      title="Edit blocks"
      meta={
        <button type="button" onClick={() => setShowForm((s) => !s)} className={chipBtn}>
          {showForm ? "close" : "+ block"}
        </button>
      }
    >
      {error && !data ? <ErrorNote message={error} onRetry={reload} /> : null}

      {blocks.length === 0 && !showForm ? (
        <div className="flex flex-col items-start gap-3">
          <EmptyState>No rhythm yet.</EmptyState>
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
          >
            {seeding ? "Loading…" : "Load a starting rhythm"}
          </button>
        </div>
      ) : (
        <ul className="flex flex-col">
          {blocks.map((b) => (
            <BlockRow key={b.id} block={b} onChanged={reload} />
          ))}
        </ul>
      )}

      {showForm ? <BlockForm onSaved={() => { setShowForm(false); reload(); }} /> : null}
    </Panel>
  );
}

function BlockRow({ block, onChanged }: { block: RhythmBlockDTO; onChanged: () => void }) {
  const [time, setTime] = useState(block.at_time ?? "");
  const [label, setLabel] = useState(block.label);

  async function patch(body: Record<string, unknown>) {
    await sendJSON(`/api/rhythm/${block.id}`, "PATCH", body);
    onChanged();
  }

  return (
    <li
      className={`group flex items-center gap-2 border-t border-white/[0.05] py-2 first:border-t-0 ${
        block.active ? "" : "opacity-50"
      }`}
    >
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onBlur={() => { if (time !== (block.at_time ?? "")) patch({ at_time: time }); }}
        aria-label="Block time"
        className="w-[7.25rem] shrink-0 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 font-mono text-xs text-ink-4 focus:border-ember/30 focus:outline-none"
      />
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label.trim() && label !== block.label) patch({ label, at_time: block.at_time ?? "" }); }}
        aria-label="Block label"
        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 text-sm text-ink-4 hover:border-white/[0.08] focus:border-ember/30 focus:outline-none"
      />
      {block.days.length > 0 ? (
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3 sm:inline">
          {block.days.join("/")}
        </span>
      ) : null}
      {block.kind ? (
        <span className="hidden shrink-0 sm:inline">
          <Tag label={KIND_LABEL[block.kind] ?? block.kind} kind="personal" />
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => patch({ active: !block.active })}
        className="shrink-0 text-[10px] uppercase tracking-wider text-ink-3 opacity-0 transition-opacity hover:text-ember group-hover:opacity-100"
      >
        {block.active ? "pause" : "on"}
      </button>
      <button
        type="button"
        onClick={async () => { await sendJSON(`/api/rhythm/${block.id}`, "DELETE"); onChanged(); }}
        aria-label="Delete block"
        className="shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
      >
        ×
      </button>
    </li>
  );
}

const DAY_OPTIONS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function BlockForm({ onSaved }: { onSaved: () => void }) {
  const [atTime, setAtTime] = useState("");
  const [label, setLabel] = useState("");
  const [detail, setDetail] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/rhythm", "POST", {
        at_time: atTime || null,
        label,
        detail: detail || null,
        days,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-[3px] border border-dashed border-white/[0.08] p-3">
      <div className="flex flex-wrap gap-2">
        <div className="w-32">
          <div className={labelCls}>Time</div>
          <input type="time" className={inputCls} value={atTime} onChange={(e) => setAtTime(e.target.value)} />
        </div>
        <div className="min-w-[10rem] flex-1">
          <div className={labelCls}>Label</div>
          <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Protected Akrov block" required />
        </div>
      </div>
      <div>
        <div className={labelCls}>Detail (optional)</div>
        <input className={inputCls} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div>
        <div className={labelCls}>Only on days (optional — blank = every day)</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays((c) => (c.includes(d) ? c.filter((x) => x !== d) : [...c, d]))}
              className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] uppercase transition-colors ${
                days.includes(d) ? "border-ember/40 bg-ember/15 text-ember" : "border-white/10 text-ink-3 hover:border-ember/30"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !label.trim()}
        className="self-start rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add block"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Meditation — timer + session log + gentle streak.
// ---------------------------------------------------------------------------

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function MeditationPanel() {
  const { data, reload } = useResource<MeditationStatsDTO>("/api/meditation");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      if (startRef.current != null) setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  function start() {
    startRef.current = Date.now() - elapsed * 1000;
    setRunning(true);
  }
  function pause() {
    setRunning(false);
  }
  async function finish() {
    setRunning(false);
    const secs = elapsed;
    setElapsed(0);
    startRef.current = null;
    if (secs >= 5) {
      setBusy(true);
      try {
        await sendJSON("/api/meditation", "POST", { duration_sec: secs });
        reload();
      } finally {
        setBusy(false);
      }
    }
  }
  async function quickLog(min: number) {
    setBusy(true);
    try {
      await sendJSON("/api/meditation", "POST", { duration_sec: min * 60 });
      reload();
    } finally {
      setBusy(false);
    }
  }

  const s = data;

  return (
    <Panel
      title="Meditation"
      meta={s ? `${s.streak}-day streak` : ""}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="font-mono text-4xl tracking-tight text-ink-4 tabular-nums">{fmtClock(elapsed)}</div>
        <div className="flex items-center gap-2">
          {running ? (
            <button type="button" onClick={pause} className="rounded-[3px] border border-white/[0.1] px-4 py-1.5 text-sm text-ink-4 transition-colors hover:border-ember/40">
              Pause
            </button>
          ) : (
            <button type="button" onClick={start} className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-1.5 text-sm font-medium text-ember transition-colors hover:bg-ember/20">
              {elapsed > 0 ? "Resume" : "Start"}
            </button>
          )}
          <button
            type="button"
            onClick={finish}
            disabled={elapsed < 5 || busy}
            className="rounded-[3px] border border-white/[0.1] px-4 py-1.5 text-sm text-ink-4 transition-colors hover:border-ember/40 disabled:opacity-40"
          >
            {busy ? "…" : "Finish & log"}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <span>quick log</span>
          {[5, 10, 20].map((m) => (
            <button key={m} type="button" onClick={() => quickLog(m)} disabled={busy} className={chipBtn}>
              {m}m
            </button>
          ))}
        </div>
      </div>

      {s ? (
        <div className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-white/[0.05] pt-3 text-xs text-ink-3">
          <span>{s.today ? "✅ meditated today" : "not yet today"}</span>
          <span>{s.sessionsThisWeek} this week</span>
          <span>{s.totalMinutes} min total</span>
        </div>
      ) : null}

      {s && s.recent.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-ink-3">recent sessions</summary>
          <ul className="mt-1 flex flex-col">
            {s.recent.map((r) => (
              <li key={r.id} className="group flex items-center gap-2 py-1 text-xs text-ink-3">
                <span className="font-mono">{r.session_date}</span>
                <span className="text-ink-4">{Math.round(r.duration_sec / 60)} min</span>
                {r.note ? <span className="truncate">· {r.note}</span> : null}
                <button
                  type="button"
                  onClick={async () => { await sendJSON(`/api/meditation/${r.id}`, "DELETE"); reload(); }}
                  aria-label="Delete session"
                  className="ml-auto text-ink-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Reading list — want / reading / finished, progress per book.
// ---------------------------------------------------------------------------

const NEXT_STATUS: Record<ReadingStatus, ReadingStatus> = {
  want: "reading",
  reading: "finished",
  finished: "want",
};

function ReadingPanel() {
  const { data, reload } = useResource<ReadingListDTO>("/api/reading");
  const [showForm, setShowForm] = useState(false);
  const books = data?.books ?? [];

  return (
    <Panel
      title="Reading"
      meta={
        <span className="flex items-center gap-2">
          <span>{data?.finishedCount ?? 0} finished</span>
          <button type="button" onClick={() => setShowForm((s) => !s)} className={chipBtn}>
            {showForm ? "close" : "+ book"}
          </button>
        </span>
      }
    >
      {showForm ? <BookForm onSaved={() => { setShowForm(false); reload(); }} /> : null}
      {books.length === 0 && !showForm ? (
        <EmptyState>No books yet — add one to want-to-read.</EmptyState>
      ) : (
        <ul className="mt-1 flex flex-col gap-2">
          {books.map((b) => (
            <BookRow key={b.id} book={b} onChanged={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function BookRow({ book, onChanged }: { book: ReadingBookDTO; onChanged: () => void }) {
  const [page, setPage] = useState(book.current_page != null ? String(book.current_page) : "");

  async function patch(body: Record<string, unknown>) {
    await sendJSON(`/api/reading/${book.id}`, "PATCH", body);
    onChanged();
  }

  const statusTone =
    book.status === "reading" ? "text-ember" : book.status === "finished" ? "text-ok" : "text-ink-3";

  return (
    <li className="rounded-[3px] border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink-4">{book.title}</div>
          {book.author ? <div className="truncate text-[11px] text-ink-3">{book.author}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => patch({ status: NEXT_STATUS[book.status] })}
            className={`text-[10px] uppercase tracking-wider ${statusTone} transition-colors hover:text-ember`}
          >
            {book.status}
          </button>
          <button
            type="button"
            onClick={async () => { await sendJSON(`/api/reading/${book.id}`, "DELETE"); onChanged(); }}
            aria-label="Delete book"
            className="text-ink-3 transition-colors hover:text-danger"
          >
            ×
          </button>
        </div>
      </div>

      {book.progress != null ? (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-ember" style={{ width: `${book.progress}%` }} />
        </div>
      ) : null}

      {book.status === "reading" ? (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-3">
          <span>page</span>
          <input
            type="number"
            inputMode="numeric"
            value={page}
            onChange={(e) => setPage(e.target.value)}
            onBlur={() => { if (page !== String(book.current_page ?? "")) patch({ current_page: page || null }); }}
            className="w-16 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 font-mono text-ink-4 focus:border-ember/30 focus:outline-none"
            aria-label="Current page"
          />
          <span>of {book.total_pages ?? "—"}</span>
          {book.progress != null ? <span className="text-ink-4">{book.progress}%</span> : null}
        </div>
      ) : null}
    </li>
  );
}

function BookForm({ onSaved }: { onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [status, setStatus] = useState<ReadingStatus>("want");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendJSON("/api/reading", "POST", {
        title,
        author: author || null,
        total_pages: totalPages || null,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 flex flex-col gap-2 rounded-[3px] border border-dashed border-white/[0.08] p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2">
          <div className={labelCls}>Title</div>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="col-span-2">
          <div className={labelCls}>Author</div>
          <input className={inputCls} value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div>
          <div className={labelCls}>Pages</div>
          <input className={inputCls} value={totalPages} onChange={(e) => setTotalPages(e.target.value)} inputMode="numeric" placeholder="320" />
        </div>
        <div className="col-span-3">
          <div className={labelCls}>Shelf</div>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ReadingStatus)}>
            <option value="want">want to read</option>
            <option value="reading">reading</option>
            <option value="finished">finished</option>
          </select>
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="self-start rounded-[3px] border border-ember/30 bg-ember/10 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add book"}
      </button>
    </form>
  );
}

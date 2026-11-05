"use client";

import { useMemo, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { CanvasSection } from "@/components/dashboard/CanvasSection";
import { TaskItem } from "@/components/dashboard/TaskItem";
import { emitRefresh, sendJSON, useResource } from "@/lib/api";
import { courseCode } from "@/lib/format";
import type {
  CalendarEventDTO,
  CourseDTO,
  TaskDTO,
  Urgency,
} from "@/lib/types";

/** Calendar categories the School tab treats as coursework. */
const EXAM_CATEGORY = "School — Exams / Projects";
const WORK_CATEGORY = "School — Assignments";
const KEY_CATEGORY = "Key dates";
const SCHOOL_CATEGORIES = [EXAM_CATEGORY, WORK_CATEGORY, KEY_CATEGORY];

const DAY_MS = 86_400_000;
const WEEKS_COLLAPSED = 4;

// ---------------------------------------------------------------------------
// Date helpers (all in the browser's local zone, which is the operator's zone)
// ---------------------------------------------------------------------------

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** All-day events arrive as YYYY-MM-DD; timed ones as ISO. Both land on a local day. */
function eventDay(ev: CalendarEventDTO): Date {
  if (ev.allDay) {
    const [y, m, d] = ev.start.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(ev.start);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** Monday of the week containing `d`. */
function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (out.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  out.setDate(out.getDate() - shift);
  return out;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function fmtRange(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const a = start.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const b = end.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${a} – ${b}`;
}

function fmtTime(ev: CalendarEventDTO): string | null {
  if (ev.allDay) return null;
  return new Date(ev.start).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function stripCode(title: string): string {
  return title.replace(/^[A-Z]{3,4}\s?\d{3,4}\s*—\s*/, "");
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/**
 * School HQ: what is coming and when, first — a dated runway of graded work
 * built from the calendar — then the course reference cards, then loose tasks.
 */
export function SchoolBoard() {
  const { data: tasks, loading, error, reload } = useResource<TaskDTO[]>(
    "/api/tasks?domain=school",
  );
  const { data: courses, reload: reloadCourses } =
    useResource<CourseDTO[]>("/api/courses");

  const today = new Date();
  const from = dayKey(new Date(today.getTime() - 7 * DAY_MS));
  const to = dayKey(new Date(today.getTime() + 200 * DAY_MS));
  const { data: cal } = useResource<{ events: CalendarEventDTO[] }>(
    `/api/calendar?from=${from}&to=${to}`,
  );

  async function onAdded() {
    await reloadCourses();
    reload();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Runway events={cal?.events ?? []} />

      <CoursesSection courses={courses ?? []} />

      <OpenTasks
        tasks={tasks ?? []}
        courses={courses ?? []}
        loading={loading}
        error={error}
        reload={reload}
      />

      <AddAssignment courses={courses ?? []} onAdded={onAdded} />

      <CanvasSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Runway — the headline. Dated graded work, week by week.
// ---------------------------------------------------------------------------

interface WeekBucket {
  start: Date;
  label: string;
  events: CalendarEventDTO[];
}

function Runway({ events }: { events: CalendarEventDTO[] }) {
  const [showAll, setShowAll] = useState(false);
  const [examsOnly, setExamsOnly] = useState(false);

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisWeek = weekStart(todayStart);

  const weeks = useMemo(() => {
    const relevant = events
      .filter((e) => e.category && SCHOOL_CATEGORIES.includes(e.category))
      .filter((e) => eventDay(e).getTime() >= todayStart.getTime())
      .filter((e) => !examsOnly || e.category === EXAM_CATEGORY)
      .sort((a, b) => a.start.localeCompare(b.start));

    const map = new Map<number, WeekBucket>();
    for (const ev of relevant) {
      const ws = weekStart(eventDay(ev));
      const k = ws.getTime();
      if (!map.has(k)) {
        const offset = Math.round((k - thisWeek.getTime()) / (7 * DAY_MS));
        map.set(k, {
          start: ws,
          label:
            offset === 0 ? "This week" : offset === 1 ? "Next week" : `Week of ${fmtRange(ws)}`,
          events: [],
        });
      }
      map.get(k)!.events.push(ev);
    }
    return [...map.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, examsOnly, todayStart.getTime(), thisWeek.getTime()]);

  const shown = showAll ? weeks : weeks.slice(0, WEEKS_COLLAPSED);
  const examCount = events.filter((e) => e.category === EXAM_CATEGORY).length;

  return (
    <Panel
      title="What's coming"
      meta={
        <button
          type="button"
          onClick={() => setExamsOnly((v) => !v)}
          className={`rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
            examsOnly
              ? "border-ember/40 bg-ember/10 text-ember"
              : "border-white/[0.10] text-ink-3 hover:border-white/25"
          }`}
        >
          {examsOnly ? `${examCount} exams` : "Exams only"}
        </button>
      }
    >
      {weeks.length === 0 ? (
        <EmptyState>Nothing scheduled ahead. Load a syllabus to fill this in.</EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {shown.map((w) => (
              <div key={w.start.getTime()}>
                <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-white/[0.07] pb-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
                    {w.label}
                  </span>
                  <span className="font-mono text-[10px] text-faint">{fmtRange(w.start)}</span>
                </div>
                <ul className="flex flex-col">
                  {w.events.map((ev) => (
                    <RunwayRow key={ev.id} ev={ev} today={todayStart} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {weeks.length > WEEKS_COLLAPSED ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 w-full border-t border-white/[0.07] pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ember"
            >
              {showAll
                ? "Collapse"
                : `Show the rest of the semester · ${weeks.length - WEEKS_COLLAPSED} more weeks`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function RunwayRow({ ev, today }: { ev: CalendarEventDTO; today: Date }) {
  const day = eventDay(ev);
  const days = Math.round((day.getTime() - today.getTime()) / DAY_MS);
  const isExam = ev.category === EXAM_CATEGORY;
  const isKey = ev.category === KEY_CATEGORY;
  const code = courseCode(ev.title.match(/^[A-Z]{2,4}\s?\d{3,4}/) ? ev.title : null);
  const time = fmtTime(ev);

  const countdown =
    days === 0 ? "today" : days === 1 ? "tomorrow" : `${days}d`;
  const urgent = days <= 2;

  return (
    <li
      className={`flex items-start gap-3 border-t border-white/[0.05] py-2 first:border-t-0 ${
        isExam || isKey ? "pl-2" : ""
      }`}
      style={
        isExam
          ? { borderLeft: "2px solid var(--ember)", marginLeft: "-2px" }
          : isKey
            ? { borderLeft: "2px solid var(--warn)", marginLeft: "-2px" }
            : undefined
      }
    >
      {/* date gutter */}
      <div className="w-[68px] shrink-0 pt-0.5">
        <div className="font-mono text-[11px] text-ink-4">{fmtDay(day)}</div>
        {time ? <div className="font-mono text-[10px] text-faint">{time}</div> : null}
      </div>

      {/* marker: solid bar for exams, dot for coursework */}
      <span
        aria-hidden
        className={`mt-[7px] shrink-0 rounded-full ${
          isExam
            ? "h-1.5 w-1.5 bg-ember"
            : isKey
              ? "h-1.5 w-1.5 bg-warn"
              : "h-1 w-1 bg-ink-3/60"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {code ? (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sage">
              {code}
            </span>
          ) : null}
          <span
            className={`break-words text-sm ${
              isExam ? "font-medium text-ink-4" : "text-ink-4/90"
            }`}
          >
            {stripCode(ev.title)}
          </span>
        </div>
        {ev.notes ? (
          <div className="mt-0.5 break-words text-[11px] leading-snug text-ink-3">{ev.notes}</div>
        ) : null}
      </div>

      <span
        className={`shrink-0 pt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
          urgent ? "text-ember" : "text-faint"
        }`}
      >
        {countdown}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Courses — reference cards
// ---------------------------------------------------------------------------

function CoursesSection({ courses }: { courses: CourseDTO[] }) {
  const scheduled = courses.filter((c) => c.info?.term);
  if (scheduled.length === 0) return null;
  const term = scheduled[0].info?.term;
  const enrolled = scheduled.filter((c) => c.info?.status !== "waitlisted");
  const credits = enrolled.reduce((s, c) => s + (c.info?.credits ?? 0), 0);
  const waitCredits = scheduled
    .filter((c) => c.info?.status === "waitlisted")
    .reduce((s, c) => s + (c.info?.credits ?? 0), 0);

  return (
    <Panel
      title={`${term} — Courses`}
      meta={
        <span>
          <span className={credits < 12 ? "text-warn" : ""}>{credits} cr enrolled</span>
          {waitCredits > 0 ? <span className="text-faint"> · {waitCredits} waitlisted</span> : null}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        {scheduled.map((c) => (
          <CourseCard key={c.id} course={c} />
        ))}
      </div>
    </Panel>
  );
}

function CourseCard({ course }: { course: CourseDTO }) {
  const [open, setOpen] = useState(false);
  const info = course.info;
  if (!info) return null;
  const waitlisted = info.status === "waitlisted";
  const hasDetail = Boolean(info.grading || info.notes || info.office_hours || info.ta);

  return (
    <div
      className={`border border-white/[0.07] px-3 py-2.5 transition-colors ${
        waitlisted ? "bg-warn/[0.03]" : "bg-white/[0.015]"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="break-words text-sm font-medium text-ink-4">{course.name}</span>
        {info.credits != null ? (
          <span className="font-mono text-[10px] text-ink-3">{info.credits}cr</span>
        ) : null}
        {info.retake ? (
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-sun">
            Retake — grade replacement
          </span>
        ) : null}
        {info.status ? (
          <span
            className={`ml-auto shrink-0 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${
              waitlisted
                ? "border-warn/30 bg-warn/10 text-warn"
                : "border-ok/30 bg-ok/10 text-ok"
            }`}
          >
            {info.status}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-col gap-0.5">
        {(info.meetings ?? []).map((m, i) => (
          <div key={i} className="font-mono text-[11px] text-ink-3">
            {m.label ? `${m.label} · ` : ""}
            {m.days} {m.start}–{m.end}
            {m.location ? <span className="text-faint"> · {m.location}</span> : null}
          </div>
        ))}
      </div>

      {info.instructor ? (
        <div className="mt-1 break-words font-mono text-[10px] text-faint">
          {info.instructor}
          {info.email ? ` · ${info.email}` : ""}
        </div>
      ) : null}

      {hasDetail ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 transition-colors hover:text-ember"
          >
            {open ? "Hide syllabus" : "Syllabus"}
          </button>
          {open ? (
            <div className="mt-2 flex flex-col gap-2 border-t border-white/[0.07] pt-2">
              {info.grading ? (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(info.grading).map(([k, v]) => (
                    <span key={k} className="font-mono text-[10px] text-ink-3">
                      {k} <span className="text-ink-4">{v}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {info.office_hours ? (
                <div className="font-mono text-[10px] text-ink-3">
                  Office hours <span className="text-ink-4">{info.office_hours}</span>
                </div>
              ) : null}
              {info.ta ? (
                <div className="font-mono text-[10px] text-ink-3">
                  TA <span className="text-ink-4">{info.ta}</span>
                </div>
              ) : null}
              {info.notes ? (
                <p className="break-words text-[11px] leading-relaxed text-ink-3">{info.notes}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Open tasks — one column, full titles, nearest deadline first
// ---------------------------------------------------------------------------

const URGENCY_ORDER: Record<string, number> = { today: 0, week: 1, inbox: 2, later: 3 };

function OpenTasks({
  tasks,
  courses,
  loading,
  error,
  reload,
}: {
  tasks: TaskDTO[];
  courses: CourseDTO[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}) {
  const open = tasks.filter((t) => !t.done);
  const sorted = [...open].sort((a, b) => {
    if (a.key !== b.key) return a.key ? -1 : 1;
    if (a.due_date && b.due_date && a.due_date !== b.due_date)
      return a.due_date.localeCompare(b.due_date);
    if (a.due_date && !b.due_date) return -1;
    if (!a.due_date && b.due_date) return 1;
    return (
      (URGENCY_ORDER[a.urgency ?? "later"] ?? 9) - (URGENCY_ORDER[b.urgency ?? "later"] ?? 9)
    );
  });

  if (error && tasks.length === 0) {
    return (
      <Panel title="To do">
        <ErrorNote message={error} onRetry={reload} />
      </Panel>
    );
  }
  if (loading) return null;

  return (
    <Panel title="To do" meta={`${open.length} open`}>
      {sorted.length === 0 ? (
        <EmptyState>Nothing open. Add something below.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {sorted.map((t) => (
            <TaskItem key={t.id} task={t} onChange={reload} wrap showTag={courses.length > 1} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

interface AddAssignmentProps {
  courses: CourseDTO[];
  onAdded: () => void;
}

function AddAssignment({ courses, onAdded }: AddAssignmentProps) {
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("week");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await sendJSON("/api/tasks", "POST", {
        title: t,
        domain: "school",
        urgency,
        course: course.trim() || undefined,
      });
      setTitle("");
      onAdded();
      emitRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Add assignment">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Assignment title…"
          className="flex-1 rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none"
        />
        <input
          type="text"
          list="course-options"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="Course (pick or type)"
          className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 placeholder:text-ink-3 focus:border-ember/30 focus:outline-none sm:w-44"
        />
        <datalist id="course-options">
          {courses.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as Urgency)}
          className="rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 focus:border-ember/30 focus:outline-none"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="later">Later</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition-colors hover:bg-ember/20 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </Panel>
  );
}

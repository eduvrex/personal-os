"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DateSelectArg, EventClickArg, EventDropArg, EventInput } from "@fullcalendar/core";

import { Panel } from "@/components/ui/Panel";
import { ErrorNote } from "@/components/ui/ErrorNote";
import { sendJSON } from "@/lib/api";
import { shiftDateKey } from "@/lib/localDate";
import type { CalendarCategoryDTO, CalendarEventDTO } from "@/lib/types";

const CalendarView = dynamic(() => import("@/components/dashboard/CalendarView"), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-ink-3">Loading calendar…</div>,
});

const HIDDEN_KEY = "pos_cal_hidden";

type Drawer =
  | { mode: "create"; allDay: boolean; start: string; end: string }
  | { mode: "edit" | "view"; dto: CalendarEventDTO }
  | null;

const pad = (n: number) => String(n).padStart(2, "0");
function dtLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarBoard() {
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [categories, setCategories] = useState<CalendarCategoryDTO[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
  }, []);

  // sendJSON is POST-only; the calendar feed is a GET, so fetch it directly.
  const loadRange = useCallback(async (from: string, to: string) => {
    setRange({ from, to });
    try {
      const r = await fetch(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      if (!r.ok) {
        setLoadError(`calendar request failed (${r.status})`);
        return;
      }
      const data = await r.json();
      setEvents(data.events ?? []);
      setCategories(data.categories ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "network error");
    }
  }, []);

  const refetch = useCallback(() => {
    if (range) loadRange(range.from, range.to);
  }, [range, loadRange]);

  function toggle(name: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const fcEvents: EventInput[] = useMemo(
    () =>
      events
        .filter((e) => !hidden.has(e.category ?? "General"))
        .map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end ?? undefined,
          allDay: e.allDay,
          backgroundColor: e.color,
          borderColor: e.color,
          editable: e.editable,
          extendedProps: { ...e },
        })),
    [events, hidden],
  );

  async function onEventDrop(arg: EventDropArg) {
    try {
      await sendJSON(`/api/calendar/events/${arg.event.id}`, "PATCH", {
        all_day: arg.event.allDay,
        start: arg.event.allDay ? arg.event.startStr.slice(0, 10) : arg.event.start?.toISOString(),
        end: arg.event.end ? (arg.event.allDay ? arg.event.endStr.slice(0, 10) : arg.event.end.toISOString()) : null,
      });
      refetch();
    } catch {
      arg.revert();
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Panel title="Calendar">
        {loadError ? (
          <div className="mb-2">
            <ErrorNote message={loadError} onRetry={refetch} />
          </div>
        ) : null}
        <Legend categories={categories} hidden={hidden} onToggle={toggle} onAdded={refetch} />
        <div className="mt-3">
          <CalendarView
            events={fcEvents}
            onDatesSet={loadRange}
            onSelect={(arg: DateSelectArg) =>
              setDrawer({ mode: "create", allDay: arg.allDay, start: arg.startStr, end: arg.endStr })
            }
            onEventClick={(arg: EventClickArg) => {
              const dto = arg.event.extendedProps as unknown as CalendarEventDTO;
              setDrawer({ mode: dto.editable ? "edit" : "view", dto });
            }}
            onEventDrop={onEventDrop}
          />
        </div>
      </Panel>

      {drawer ? (
        <EventDrawer
          key={drawer.mode === "create" ? `create-${drawer.start}` : drawer.dto.id}
          drawer={drawer}
          categories={categories}
          onClose={() => setDrawer(null)}
          onChanged={() => {
            setDrawer(null);
            refetch();
          }}
        />
      ) : null}
    </div>
  );
}

function Legend({
  categories,
  hidden,
  onToggle,
  onAdded,
}: {
  categories: CalendarCategoryDTO[];
  hidden: Set<string>;
  onToggle: (name: string) => void;
  onAdded: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#41d4c2");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await sendJSON("/api/calendar/categories", "POST", { name, color });
    setName("");
    setAdding(false);
    onAdded();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {categories.map((c) => {
        const off = hidden.has(c.name);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.name)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              off ? "border-white/[0.06] text-ink-3/70" : "border-white/[0.12] text-ink-4"
            }`}
            title={off ? "Hidden — click to show" : "Shown — click to hide"}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: off ? "transparent" : c.color, border: `1px solid ${c.color}` }}
            />
            {c.name}
          </button>
        );
      })}
      {adding ? (
        <form onSubmit={add} className="flex items-center gap-1.5">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name"
            className="rounded-[3px] border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-xs text-ink-4 focus:outline-none"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-6 w-8 rounded border border-white/[0.1] bg-transparent"
          />
          <button type="submit" className="rounded-[3px] border border-ember/30 bg-ember/10 px-2 py-1 text-xs text-ember">
            Add
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-full border border-dashed border-white/[0.12] px-2.5 py-1 text-xs text-ink-3 hover:text-ember"
        >
          + Category
        </button>
      )}
    </div>
  );
}

function EventDrawer({
  drawer,
  categories,
  onClose,
  onChanged,
}: {
  drawer: NonNullable<Drawer>;
  categories: CalendarCategoryDTO[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const editable = drawer.mode !== "view";
  const existing = drawer.mode === "create" ? null : drawer.dto;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "General");
  const [allDay, setAllDay] = useState(drawer.mode === "create" ? drawer.allDay : (existing?.allDay ?? true));
  const [start, setStart] = useState(() => initStart(drawer));
  const [end, setEnd] = useState(() => initEnd(drawer));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);

  function payloadDates() {
    if (allDay) {
      // FullCalendar treats an all-day `end` as EXCLUSIVE (drag/drop already
      // stores endStr that way), so shift the inclusive date shown in the
      // drawer by +1. An end on/before the start day means a one-day event.
      const startKey = start.slice(0, 10);
      const endKey = end ? end.slice(0, 10) : "";
      return {
        start: startKey,
        end: endKey && endKey > startKey ? shiftDateKey(endKey, 1) : null,
      };
    }
    return {
      start: start ? new Date(start).toISOString() : null,
      end: end ? new Date(end).toISOString() : null,
    };
  }

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const dates = payloadDates();
      const body = { title, category, all_day: allDay, notes, ...dates };
      if (drawer.mode === "edit") {
        await sendJSON(`/api/calendar/events/${drawer.dto.id}`, "PATCH", body);
      } else {
        await sendJSON("/api/calendar/events", "POST", body);
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (drawer.mode !== "edit" || busy) return;
    setBusy(true);
    try {
      await sendJSON(`/api/calendar/events/${drawer.dto.id}`, "DELETE");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-[3px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-ink-4 focus:border-ember/30 focus:outline-none";
  const label = "mb-1 block text-[10px] uppercase tracking-wider text-ink-3";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="flex-1 bg-black/50 backdrop-blur-sm" />
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-white/[0.08] bg-ink-1/95 p-5 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-ink-4">
            {drawer.mode === "create" ? "New event" : editable ? "Edit event" : drawer.dto.title}
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-ink-3 hover:text-ink-4">×</button>
        </div>

        {!editable ? (
          <div className="space-y-2 text-sm text-ink-3">
            <div><span className="text-ink-4">{drawer.dto.title}</span></div>
            <div>{drawer.dto.category}{drawer.dto.source !== "manual" ? ` · ${drawer.dto.source}` : ""}</div>
            <div>{drawer.dto.start.replace("T", " ").slice(0, 16)}</div>
            {drawer.dto.notes ? <p className="whitespace-pre-wrap">{drawer.dto.notes}</p> : null}
            <p className="pt-2 text-xs text-ink-3/70">This item comes from your data and is read-only here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <span className={label}>Title</span>
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event title" />
            </div>
            <div>
              <span className={label}>Category</span>
              <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.filter((c) => c.name !== "Google Calendar").map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-3">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={label}>Start</span>
                <input
                  type={allDay ? "date" : "datetime-local"}
                  className={input}
                  value={allDay ? start.slice(0, 10) : start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <span className={label}>End</span>
                <input
                  type={allDay ? "date" : "datetime-local"}
                  className={input}
                  value={allDay ? end.slice(0, 10) : end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <div>
              <span className={label}>Notes</span>
              <textarea rows={3} className={`${input} resize-y`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-[3px] border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember hover:bg-ember/20 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
              {drawer.mode === "edit" ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="rounded-[3px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger hover:bg-danger/20 disabled:opacity-50"
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function initStart(d: NonNullable<Drawer>): string {
  if (d.mode === "create") {
    return d.allDay ? d.start.slice(0, 10) : dtLocal(new Date(d.start));
  }
  const dto = d.dto;
  return dto.allDay ? dto.start.slice(0, 10) : dtLocal(new Date(dto.start));
}
function initEnd(d: NonNullable<Drawer>): string {
  if (d.mode === "create") return "";
  const dto = d.dto;
  if (!dto.end) return "";
  if (!dto.allDay) return dtLocal(new Date(dto.end));
  // Stored all-day ends are exclusive — show the inclusive last day (a
  // degenerate end on/before the start collapses to the start day).
  const inclusive = shiftDateKey(dto.end.slice(0, 10), -1);
  const startKey = dto.start.slice(0, 10);
  return inclusive > startKey ? inclusive : startKey;
}

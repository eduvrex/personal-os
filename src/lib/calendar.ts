import "server-only";

import ICAL from "ical.js";

import { listFeeds, visibleFeedTexts } from "@/lib/calendarFeeds";
import { db, USER_ID } from "@/lib/db";
import { getProfile } from "@/lib/profile";
import { localDateKey, localToUtcIso } from "@/lib/localDate";
import type { CalendarCategoryDTO, CalendarEventDTO } from "@/lib/types";

const GCAL_CATEGORY = "Google Calendar";
const GCAL_COLOR = "#8c9a82";
const FALLBACK_COLOR = "#a79e8c";
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<CalendarCategoryDTO[]> {
  const { data, error } = await db()
    .from("event_categories")
    .select("id,name,color,visible")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  // Resilient: before the migration runs, return just the virtual gcal category.
  if (error) {
    return process.env.GOOGLE_CALENDAR_ICAL_URL
      ? [{ id: "gcal", name: GCAL_CATEGORY, color: GCAL_COLOR, visible: true }]
      : [];
  }
  const cats: CalendarCategoryDTO[] = (data ?? []).map((c) => ({
    id: String(c.id),
    name: c.name,
    color: c.color,
    visible: c.visible ?? true,
  }));
  if (process.env.GOOGLE_CALENDAR_ICAL_URL) {
    cats.push({ id: "gcal", name: GCAL_CATEGORY, color: GCAL_COLOR, visible: true });
  }
  // Every stored feed (Google/Microsoft/other) is its own toggleable category.
  for (const feed of await listFeeds()) {
    cats.push({ id: `feed:${feed.id}`, name: feed.name, color: feed.color, visible: feed.visible });
  }
  return cats;
}

export async function addCategory(name: string, color: string): Promise<CalendarCategoryDTO> {
  const { data, error } = await db()
    .from("event_categories")
    .upsert({ user_id: USER_ID, name: name.trim(), color }, { onConflict: "user_id,name" })
    .select("id,name,color,visible")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), name: data.name, color: data.color, visible: data.visible ?? true };
}

async function colorMap(): Promise<Map<string, string>> {
  const cats = await listCategories();
  return new Map(cats.map((c) => [c.name, c.color]));
}

// ---------------------------------------------------------------------------
// Manual event CRUD
// ---------------------------------------------------------------------------

function manualToDTO(r: Record<string, unknown>, colors: Map<string, string>): CalendarEventDTO {
  const allDay = Boolean(r.all_day);
  const startsAt = String(r.starts_at);
  const endsAt = r.ends_at ? String(r.ends_at) : null;
  const category = (r.category as string) ?? null;
  return {
    id: String(r.id),
    title: String(r.title),
    start: allDay ? startsAt.slice(0, 10) : startsAt,
    end: endsAt ? (allDay ? endsAt.slice(0, 10) : endsAt) : null,
    allDay,
    category,
    color: (r.color as string) || colors.get(category ?? "") || FALLBACK_COLOR,
    notes: (r.notes as string) ?? null,
    source: (r.source as string) ?? "manual",
    source_id: (r.source_id as string) ?? null,
    editable: ((r.source as string) ?? "manual") === "manual",
  };
}

export async function createEvent(input: {
  title: string;
  category?: string | null;
  start: string;
  end?: string | null;
  all_day?: boolean;
  notes?: string | null;
  color?: string | null;
}): Promise<CalendarEventDTO> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("calendar_events")
    .insert({
      user_id: USER_ID,
      title: input.title.trim(),
      category: input.category ?? "General",
      starts_at: input.start,
      ends_at: input.end ?? null,
      all_day: input.all_day ?? false,
      notes: input.notes ?? null,
      color: input.color ?? null,
      source: "manual",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return manualToDTO(data as Record<string, unknown>, await colorMap());
}

export async function updateEvent(
  id: string,
  input: Record<string, unknown>,
): Promise<CalendarEventDTO | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.title === "string") patch.title = input.title.trim();
  if ("category" in input) patch.category = input.category ?? null;
  if ("start" in input) patch.starts_at = input.start;
  if ("end" in input) patch.ends_at = input.end ?? null;
  if ("all_day" in input) patch.all_day = Boolean(input.all_day);
  if ("notes" in input) patch.notes = input.notes ?? null;
  if ("color" in input) patch.color = input.color ?? null;

  const { data, error } = await db()
    .from("calendar_events")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .eq("source", "manual")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? manualToDTO(data as Record<string, unknown>, await colorMap()) : null;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await db()
    .from("calendar_events")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id)
    .eq("source", "manual");
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Derived events (read-only, mapped to categories)
// ---------------------------------------------------------------------------

function dayEvent(
  id: string,
  title: string,
  dateKey: string,
  category: string,
  colors: Map<string, string>,
  source: string,
  sourceId: string | null,
): CalendarEventDTO {
  return {
    id,
    title,
    start: dateKey,
    end: null,
    allDay: true,
    category,
    color: colors.get(category) || FALLBACK_COLOR,
    notes: null,
    source,
    source_id: sourceId,
    editable: false,
  };
}

async function derivedEvents(
  fromDay: string,
  toDay: string,
  colors: Map<string, string>,
): Promise<CalendarEventDTO[]> {
  const inRange = (d: string | null) => !!d && d >= fromDay && d <= toDay;
  const out: CalendarEventDTO[] = [];

  const [apps, tasks, paths, profile, canvas] = await Promise.all([
    db().from("applications").select("id,org,title,deadline").eq("user_id", USER_ID).not("deadline", "is", null),
    db().from("tasks").select("id,title,due_date,due_time,domain").eq("user_id", USER_ID).not("due_date", "is", null).is("completed_at", null),
    db().from("paths").select("id,title,target_date,milestones").eq("user_id", USER_ID),
    getProfile(),
    db()
      .from("canvas_assignments")
      .select("canvas_id,name,due_at,kind,submitted")
      .eq("user_id", USER_ID)
      .not("due_at", "is", null)
      .then((r) => r, () => ({ data: [], error: null })),
  ]);

  for (const a of apps.data ?? []) {
    if (inRange(a.deadline)) {
      out.push(dayEvent(`app:${a.id}`, `${a.title} — deadline`, a.deadline, "Application deadlines", colors, "app", String(a.id)));
    }
  }
  for (const t of tasks.data ?? []) {
    if (inRange(t.due_date)) {
      const cat = t.domain === "school" ? "School — Assignments" : "General";
      if (t.due_time) {
        out.push({
          id: `task:${t.id}`,
          title: t.title,
          start: localToUtcIso(t.due_date, String(t.due_time).slice(0, 5)),
          end: null,
          allDay: false,
          category: cat,
          color: colors.get(cat) || FALLBACK_COLOR,
          notes: null,
          source: "task",
          source_id: String(t.id),
          editable: false,
        });
      } else {
        out.push(dayEvent(`task:${t.id}`, t.title, t.due_date, cat, colors, "task", String(t.id)));
      }
    }
  }
  // Canvas assignments (read-only mirror). Submitted ones stay off the calendar.
  for (const a of canvas.data ?? []) {
    const due = typeof a.due_at === "string" ? a.due_at.slice(0, 10) : null;
    if (!due || a.submitted || !inRange(due)) continue;
    const category =
      a.kind === "assignment" ? "School — Assignments" : "School — Exams / Projects";
    out.push(dayEvent(`canvas:${a.canvas_id}`, String(a.name), due, category, colors, "canvas", String(a.canvas_id)));
  }

  for (const p of paths.data ?? []) {
    if (inRange(p.target_date)) {
      out.push(dayEvent(`plan:${p.id}`, `${p.title} — target`, p.target_date, "Personal — Goal dates", colors, "plan", String(p.id)));
    }
    // Milestones that carry their own target date.
    const milestones = Array.isArray(p.milestones) ? p.milestones : [];
    milestones.forEach((m: { label?: unknown; date?: unknown; done?: unknown }, i: number) => {
      const date = typeof m.date === "string" ? m.date.slice(0, 10) : null;
      if (date && inRange(date) && !m.done) {
        out.push(dayEvent(`ms:${p.id}:${i}`, String(m.label ?? "Milestone"), date, "Personal — Goal dates", colors, "plan", String(p.id)));
      }
    });
  }
  (profile.key_dates ?? []).forEach((kd, i) => {
    if (inRange(kd.date)) {
      out.push(dayEvent(`kd:${i}`, kd.label, kd.date, "Key dates", colors, "keydate", null));
    }
  });

  return out;
}

// ---------------------------------------------------------------------------
// Google Calendar overlay (raw feed cached 5 min; expanded per range)
// ---------------------------------------------------------------------------

let rawFeedCache: { at: number; text: string } | null = null;
const FEED_TTL_MS = 5 * 60 * 1000;

async function rawFeed(): Promise<string | null> {
  const url = process.env.GOOGLE_CALENDAR_ICAL_URL;
  if (!url) return null;
  if (rawFeedCache && Date.now() - rawFeedCache.at < FEED_TTL_MS) return rawFeedCache.text;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return rawFeedCache?.text ?? null;
    const text = await res.text();
    rawFeedCache = { at: Date.now(), text };
    return text;
  } catch {
    return rawFeedCache?.text ?? null;
  }
}

function fmt(t: ICAL.Time): { start: string; allDay: boolean } {
  if (t.isDate) return { start: `${t.year}-${pad(t.month)}-${pad(t.day)}`, allDay: true };
  return { start: t.toJSDate().toISOString(), allDay: false };
}

export interface IcsExpandOptions {
  category?: string;
  color?: string;
  source?: string;
  idPrefix?: string;
}

/** Expand an ICS feed into events within [startMs, endMs]. Pure; exported for tests. */
export function expandIcs(
  text: string,
  startMs: number,
  endMs: number,
  opts: IcsExpandOptions = {},
): CalendarEventDTO[] {
  const category = opts.category ?? GCAL_CATEGORY;
  const color = opts.color ?? GCAL_COLOR;
  const source = opts.source ?? "gcal";
  const idPrefix = opts.idPrefix ?? "gcal";
  const out: CalendarEventDTO[] = [];
  let comp: ICAL.Component;
  try {
    comp = new ICAL.Component(ICAL.parse(text));
  } catch {
    return [];
  }
  for (const ve of comp.getAllSubcomponents("vevent")) {
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(ve);
    } catch {
      continue;
    }
    const add = (t: ICAL.Time) => {
      const f = fmt(t);
      out.push({
        id: `${idPrefix}:${event.uid}:${f.start}`,
        title: event.summary || "(busy)",
        start: f.start,
        end: null,
        allDay: f.allDay,
        category,
        color,
        notes: event.description || null,
        source,
        source_id: null,
        editable: false,
      });
    };
    if (event.isRecurring()) {
      const iter = event.iterator();
      let next: ICAL.Time | null;
      let guard = 0;
      while ((next = iter.next()) && guard++ < 2000) {
        const ms = next.toJSDate().getTime();
        if (ms > endMs) break;
        if (ms >= startMs) add(event.getOccurrenceDetails(next).startDate);
      }
    } else {
      const ms = event.startDate.toJSDate().getTime();
      if (ms >= startMs && ms <= endMs) add(event.startDate);
    }
  }
  return out;
}

async function gcalEvents(startMs: number, endMs: number): Promise<CalendarEventDTO[]> {
  const text = await rawFeed();
  if (!text) return [];
  return expandIcs(text, startMs, endMs);
}

/** Stored calendar feeds (Google/Microsoft/other ICS), each its own category. */
async function feedEvents(startMs: number, endMs: number): Promise<CalendarEventDTO[]> {
  const feeds = await visibleFeedTexts();
  return feeds.flatMap(({ feed, text }) =>
    text
      ? expandIcs(text, startMs, endMs, {
          category: feed.name,
          color: feed.color,
          source: `feed:${feed.provider}`,
          idPrefix: `feed:${feed.id}`,
        })
      : [],
  );
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export async function buildCalendar(
  from?: string,
  to?: string,
): Promise<{ events: CalendarEventDTO[]; categories: CalendarCategoryDTO[]; hasGoogle: boolean }> {
  const today = localDateKey();
  const fromStr = from || `${today.slice(0, 4)}-01-01`;
  const toStr = to || `${Number(today.slice(0, 4)) + 2}-12-31`;
  const fromDay = fromStr.slice(0, 10);
  const toDay = toStr.slice(0, 10);
  const startMs = Date.parse(fromStr);
  const endMs = Date.parse(toStr) + 24 * 3600 * 1000;

  const colors = await colorMap();
  const categories = await listCategories();

  // Upper bound is exclusive midnight-after-toDay: `starts_at` is timestamptz,
  // so `lte` against a bare date would drop timed events on the last day.
  const toExclusive = new Date(Date.parse(`${toDay}T00:00:00Z`) + 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const [manual, derived, gcal, feeds] = await Promise.all([
    db()
      .from("calendar_events")
      .select("*")
      .eq("user_id", USER_ID)
      .gte("starts_at", fromStr)
      .lt("starts_at", toExclusive),
    derivedEvents(fromDay, toDay, colors),
    gcalEvents(startMs, endMs),
    feedEvents(startMs, endMs),
  ]);

  const manualEvents = (manual.data ?? []).map((r) => manualToDTO(r as Record<string, unknown>, colors));
  const events = [...manualEvents, ...derived, ...gcal, ...feeds];
  return { events, categories, hasGoogle: !!process.env.GOOGLE_CALENDAR_ICAL_URL };
}

/**
 * Today's calendar events — used by the morning briefing.
 */
export async function todayCalendarEvents(): Promise<CalendarEventDTO[]> {
  const today = localDateKey();
  // Fetch a day either side: timed events carry UTC instants, so today's
  // early-morning (or late-night) local events can sit on a neighbouring UTC date.
  const dayBefore = localDateKey(new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000));
  const dayAfter = localDateKey(new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000));
  const { events } = await buildCalendar(dayBefore, dayAfter);
  // Resolve each event's day in the operator's timezone.
  const dayOf = (e: CalendarEventDTO) =>
    e.allDay ? e.start.slice(0, 10) : localDateKey(new Date(e.start));
  return events
    .filter((e) => dayOf(e) === today)
    .sort((a, b) => a.start.localeCompare(b.start));
}

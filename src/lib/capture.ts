import "server-only";

import { createApplication } from "@/lib/applications";
import { createEvent, deleteEvent } from "@/lib/calendar";
import { listCourses } from "@/lib/courses";
import { db, USER_ID } from "@/lib/db";
import { addJournal } from "@/lib/journal";
import { localDateKey, localToUtcIso } from "@/lib/localDate";
import { addMemory, removeMemoryByCustomIds } from "@/lib/memory";
import { createPlan } from "@/lib/plans";
import { addBook } from "@/lib/reading";
import {
  cleanTaskTitle,
  extractCaptures,
  looksLikeSchool,
  parseWhen,
  type CaptureExtraction,
} from "@/lib/router/classifyCapture";
import { createTask } from "@/lib/tasks";
import type { CaptureResultDTO, CaptureRoute, Urgency } from "@/lib/types";

const LABELS: Record<CaptureRoute, string> = {
  task: "Tasks",
  event: "Calendar",
  journal: "Reflect (journal)",
  note: "Brain (notes)",
  personal: "Personal (private)",
  plan: "Goals & Plans",
  reading: "Reading List",
  application: "Applications",
};

const CLARIFY_BELOW = 0.6;

export interface CaptureItemOutcome {
  route: CaptureRoute;
  label: string;
  routedId: string | null;
  title: string | null;
}

export interface CaptureOutcome extends CaptureResultDTO {
  routedId: string | null;
  captureId: string;
  items: CaptureItemOutcome[];
  confidence?: number;
}

function daysOut(date: string | null): number | null {
  if (!date) return null;
  const ms = Date.parse(`${date}T12:00:00Z`) - Date.parse(`${localDateKey()}T12:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Undated actions stay visible in the inbox instead of polluting today's plan. */
export function urgencyFor(date: string | null): Urgency {
  const days = daysOut(date);
  if (days === null) return "inbox";
  if (days <= 0) return "today";
  if (days <= 7) return "week";
  return "later";
}

function whenLabel(date: string | null, time: string | null): string {
  if (!date) return "";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
  return ` · ${day}${time ? `, ${time}` : ""}`;
}

function labelFor(extraction: CaptureExtraction): string {
  if (extraction.route === "task" && !extraction.date) return "Task Inbox";
  const base = LABELS[extraction.route];
  return extraction.route === "task" || extraction.route === "event"
    ? `${base}${whenLabel(extraction.date, extraction.time)}`
    : base;
}

function resolveExtraction(extraction: CaptureExtraction): CaptureExtraction {
  if (extraction.route === "event" && !extraction.date && !extraction.time) {
    return {
      ...extraction,
      route: "task",
      confidence: Math.min(extraction.confidence ?? 0.5, 0.55),
    };
  }
  return extraction;
}

async function existingCourseId(extraction: CaptureExtraction, text: string): Promise<string | null> {
  if (extraction.domain !== "school" && !looksLikeSchool(text)) return null;
  const courses = await listCourses();
  const wanted = extraction.course?.trim().toLowerCase();
  if (wanted) {
    const exact = courses.find((course) => course.name.toLowerCase() === wanted);
    if (exact) return exact.id;
  }
  const haystack = `${text} ${extraction.title ?? ""}`.toLowerCase();
  return courses.find((course) => haystack.includes(course.name.toLowerCase()))?.id ?? null;
}

async function createArtifact(
  rawText: string,
  extraction: CaptureExtraction,
  source: string,
): Promise<string | null> {
  const text = extraction.text?.trim() || rawText;
  const title = extraction.title || cleanTaskTitle(text) || text;

  if (extraction.route === "task") {
    const school = extraction.domain === "school" || looksLikeSchool(text);
    const task = await createTask({
      title,
      domain: school ? "school" : "personal",
      urgency: urgencyFor(extraction.date),
      due_date: extraction.date,
      due_time: extraction.date ? extraction.time : null,
      entity_id: school ? await existingCourseId(extraction, text) : null,
      skipMemory: true,
    });
    return task.id;
  }
  if (extraction.route === "event") {
    const date = extraction.date ?? localDateKey();
    const event = await createEvent({
      title,
      category: extraction.domain === "school" ? "School — Exams / Projects" : "General",
      start: extraction.time ? localToUtcIso(date, extraction.time) : date,
      all_day: !extraction.time,
      notes: text === title ? null : text,
    });
    return event.id;
  }
  if (extraction.route === "journal") {
    return (await addJournal({ text, source, skipMemory: true })).id;
  }
  if (extraction.route === "personal") {
    return (await addJournal({ text, source, personal: true })).id;
  }
  if (extraction.route === "plan") {
    return (await createPlan({ title, target_date: extraction.date })).id;
  }
  if (extraction.route === "reading") {
    return (await addBook({
      title,
      author: extraction.author ?? null,
      status: "want",
      current_page: null,
      total_pages: null,
      progress_pct: null,
      notes: text === title ? null : text,
    })).id;
  }
  if (extraction.route === "application") {
    const app = await createApplication({
      kind: extraction.applicationKind ?? "job",
      org: extraction.organization ?? null,
      title,
      deadline: extraction.date,
      fit_notes: text === title ? null : text,
    });
    return app.id;
  }
  return null;
}

async function deleteArtifact(route: CaptureRoute, routedId: string | null): Promise<void> {
  if (!routedId) return;
  if (route === "event") return deleteEvent(routedId);
  const table = route === "task"
    ? "tasks"
    : route === "journal" || route === "personal"
      ? "journal_entries"
      : route === "plan"
        ? "paths"
        : route === "reading"
          ? "reading_books"
          : route === "application"
            ? "applications"
            : null;
  if (!table) return;
  const { error } = await db().from(table).delete().eq("id", routedId).eq("user_id", USER_ID);
  if (error) throw new Error(error.message);
}

function memTypeFor(route: CaptureRoute): "task" | "journal" | "event" | "capture" {
  if (route === "task") return "task";
  if (route === "journal") return "journal";
  if (route === "event") return "event";
  return "capture";
}

function memorySourceId(captureId: string, index: number, count: number): string {
  return count === 1 ? captureId : `${captureId}:${index}`;
}

function publicExtraction(extraction: CaptureExtraction) {
  return {
    text: extraction.text ?? null,
    route: extraction.route,
    title: extraction.title,
    date: extraction.date,
    time: extraction.time,
    confidence: extraction.confidence ?? null,
    domain: extraction.domain ?? null,
    course: extraction.course ?? null,
    organization: extraction.organization ?? null,
    author: extraction.author ?? null,
    applicationKind: extraction.applicationKind ?? null,
  };
}

/** Shared capture pipeline for web and Telegram, including multi-item messages. */
export async function runCapture(input: {
  text: string;
  source: string;
  deferLowConfidence?: boolean;
}): Promise<CaptureOutcome> {
  const text = input.text.trim();
  const now = new Date().toISOString();
  const { data: capture, error: capErr } = await db()
    .from("raw_captures")
    .insert({
      user_id: USER_ID,
      source: input.source,
      raw_text: text,
      status: "processing",
      created_at: now,
    })
    .select("id")
    .single();
  if (capErr) throw new Error(capErr.message);

  const extractions = (await extractCaptures(text)).map(resolveExtraction);
  const primary = extractions[0];
  const confidence = Math.min(...extractions.map((item) => item.confidence ?? 0.5));

  if (input.deferLowConfidence && extractions.length === 1 && confidence < CLARIFY_BELOW) {
    const { error } = await db().from("raw_captures").update({
      routed_to: primary.route,
      classification: { items: extractions.map(publicExtraction) },
      llm_source: primary.llm,
      confidence,
      status: "pending",
    }).eq("id", capture.id);
    if (error) throw new Error(error.message);
    return {
      routedTo: primary.route,
      label: labelFor(primary),
      routedId: null,
      captureId: capture.id,
      items: [],
      confidence,
      pending: true,
      itemCount: 1,
    };
  }

  const created: { extraction: CaptureExtraction; routedId: string | null; index: number }[] = [];
  try {
    for (const [index, extraction] of extractions.entries()) {
      const routedId = await createArtifact(text, extraction, input.source);
      created.push({ extraction, routedId, index });
      const { error } = await db().from("capture_artifacts").insert({
        user_id: USER_ID,
        capture_id: capture.id,
        item_index: index,
        route: extraction.route,
        routed_id: routedId,
        extraction: publicExtraction(extraction),
        created_at: now,
      });
      if (error) throw new Error(error.message);
    }

    const { error: annotateError } = await db().from("raw_captures").update({
      routed_to: primary.route,
      routed_id: created[0]?.routedId ?? null,
      classification: { items: extractions.map(publicExtraction) },
      llm_source: primary.llm,
      confidence,
      status: "processed",
    }).eq("id", capture.id);
    if (annotateError) throw new Error(annotateError.message);
  } catch (error) {
    await Promise.allSettled(created.map((item) => deleteArtifact(item.extraction.route, item.routedId)));
    await db().from("raw_captures").delete().eq("id", capture.id).eq("user_id", USER_ID);
    throw error;
  }

  for (const item of created) {
    if (item.extraction.route === "personal") continue;
    await addMemory({
      text: item.extraction.text ?? item.extraction.title ?? text,
      sourceType: memTypeFor(item.extraction.route),
      sourceId: memorySourceId(capture.id, item.index, created.length),
    });
  }

  await db().from("audit_log").insert({
    user_id: USER_ID,
    action: "capture.routed",
    resource_type: created.length > 1 ? "multi" : primary.route,
    resource_id: created.length === 1 ? created[0].routedId : null,
    metadata: {
      source: input.source,
      item_count: created.length,
      routes: created.map((item) => item.extraction.route),
      llm: primary.llm,
      confidence,
    },
    created_at: now,
  });

  const items = created.map((item) => ({
    route: item.extraction.route,
    label: labelFor(item.extraction),
    routedId: item.routedId,
    title: item.extraction.title,
  }));
  const label = items.length === 1
    ? items[0].label
    : `${items.length} items → ${[...new Set(items.map((item) => LABELS[item.route]))].join(", ")}`;
  return {
    routedTo: primary.route,
    label,
    routedId: created[0]?.routedId ?? null,
    captureId: capture.id,
    items,
    confidence,
    itemCount: items.length,
  };
}

function storedExtraction(value: unknown): Partial<CaptureExtraction> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const first = Array.isArray(record.items) && record.items[0] && typeof record.items[0] === "object"
    ? record.items[0] as Record<string, unknown>
    : record;
  return first as Partial<CaptureExtraction>;
}

/** Re-route or confirm a pending single-item capture. */
export async function rerouteCapture(
  captureId: string,
  newRoute: CaptureRoute,
): Promise<CaptureOutcome> {
  const { data: row, error } = await db()
    .from("raw_captures")
    .select("id, raw_text, source, routed_to, routed_id, classification, status")
    .eq("id", captureId)
    .eq("user_id", USER_ID)
    .single();
  if (error || !row) throw new Error("Capture not found.");

  const text = String(row.raw_text ?? "");
  const oldRoute = (row.routed_to ?? "note") as CaptureRoute;
  const source = String(row.source ?? "web");
  const pending = row.status === "pending";
  const stored = storedExtraction(row.classification);

  if (!pending && oldRoute === newRoute) {
    const extraction = { ...stored, route: newRoute } as CaptureExtraction;
    const label = labelFor(extraction);
    return {
      routedTo: newRoute,
      label,
      routedId: row.routed_id,
      captureId,
      itemCount: 1,
      items: [{ route: newRoute, label, routedId: row.routed_id, title: extraction.title ?? null }],
    };
  }

  if (!pending) {
    await deleteArtifact(oldRoute, row.routed_id);
    await removeMemoryByCustomIds([`${memTypeFor(oldRoute)}:${captureId}`]);
  }

  const fallback = parseWhen(text);
  const extraction: CaptureExtraction = {
    ...stored,
    route: newRoute,
    text: typeof stored.text === "string" ? stored.text : text,
    title: typeof stored.title === "string" && stored.title ? stored.title : null,
    date: typeof stored.date === "string" && stored.date ? stored.date : fallback.date,
    time: typeof stored.time === "string" && stored.time ? stored.time : fallback.time,
    llm: "guard",
    confidence: 1,
  };
  const routedId = await createArtifact(text, extraction, source);
  if (newRoute !== "personal") {
    await addMemory({ text: extraction.text ?? text, sourceType: memTypeFor(newRoute), sourceId: captureId });
  }

  await db().from("capture_artifacts").delete().eq("capture_id", captureId).eq("user_id", USER_ID);
  const { error: artifactError } = await db().from("capture_artifacts").insert({
    user_id: USER_ID,
    capture_id: captureId,
    item_index: 0,
    route: newRoute,
    routed_id: routedId,
    extraction: publicExtraction(extraction),
  });
  if (artifactError) throw new Error(artifactError.message);

  const { error: updateError } = await db().from("raw_captures").update({
    routed_to: newRoute,
    routed_id: routedId,
    classification: { items: [publicExtraction(extraction)] },
    confidence: 1,
    status: "processed",
  }).eq("id", captureId);
  if (updateError) throw new Error(updateError.message);

  await db().from("audit_log").insert({
    user_id: USER_ID,
    action: pending ? "capture.confirmed" : "capture.rerouted",
    resource_type: newRoute,
    resource_id: routedId,
    metadata: { from: oldRoute, to: newRoute },
    created_at: new Date().toISOString(),
  });

  const label = labelFor(extraction);
  return {
    routedTo: newRoute,
    label,
    routedId,
    captureId,
    itemCount: 1,
    items: [{ route: newRoute, label, routedId, title: extraction.title }],
  };
}

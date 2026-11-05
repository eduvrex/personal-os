import "server-only";

import { anthropicClient, extractJson, lightModel, textFrom } from "@/lib/ai";
import { db, USER_ID } from "@/lib/db";
import { getResume } from "@/lib/resume";
import type { ApplicationDTO, ApplicationStatus } from "@/lib/types";

const STATUSES: ApplicationStatus[] = [
  "researching",
  "applying",
  "applied",
  "interview",
  "decision",
];

/** Per-field length caps applied on create/update. */
const FIELD_CAPS: Record<string, number> = {
  org: 300, title: 300, field: 200, location: 200, language: 100,
  duration: 100, eu_tuition: 100, url: 2000, deadline_indicative: 300,
  test_required: 200, fit_notes: 5000, next_action: 1000, decision: 1000,
  tailored_resume: 50_000, cover_letter: 50_000,
};

function capped(field: string, v: unknown): unknown {
  if (typeof v !== "string") return v;
  const max = FIELD_CAPS[field];
  return max ? v.slice(0, max) : v;
}

/** Deadline must be a YYYY-MM-DD date (or null). */
function asDeadline(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const key = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(`${key}T00:00:00Z`))
    ? key
    : null;
}

function toDTO(r: Record<string, unknown>): ApplicationDTO {
  return {
    id: String(r.id),
    kind: (r.kind as ApplicationDTO["kind"]) ?? "masters",
    org: (r.org as string) ?? null,
    title: (r.title as string) ?? null,
    field: (r.field as string) ?? null,
    location: (r.location as string) ?? null,
    language: (r.language as string) ?? null,
    duration: (r.duration as string) ?? null,
    eu_tuition: (r.eu_tuition as string) ?? null,
    url: (r.url as string) ?? null,
    status: (r.status as ApplicationStatus) ?? "researching",
    deadline: (r.deadline as string) ?? null,
    deadline_indicative: (r.deadline_indicative as string) ?? null,
    test_required: (r.test_required as string) ?? null,
    fit_notes: (r.fit_notes as string) ?? null,
    tailored_resume: (r.tailored_resume as string) ?? null,
    cover_letter: (r.cover_letter as string) ?? null,
    next_action: (r.next_action as string) ?? null,
    decision: (r.decision as string) ?? null,
    realism: (r.realism as ApplicationDTO["realism"]) ?? null,
  };
}

export async function listApplications(): Promise<ApplicationDTO[]> {
  const { data, error } = await db()
    .from("applications")
    .select("*")
    .eq("user_id", USER_ID)
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("org", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toDTO(r as Record<string, unknown>));
}

export async function createApplication(
  input: Record<string, unknown>,
): Promise<ApplicationDTO> {
  const kind = ["masters", "job", "campus_job"].includes(String(input.kind))
    ? String(input.kind)
    : "job";
  const status = STATUSES.includes(input.status as ApplicationStatus)
    ? input.status
    : "researching";
  const { data, error } = await db()
    .from("applications")
    .insert({
      user_id: USER_ID,
      kind,
      org: capped("org", input.org) ?? null,
      title: capped("title", input.title) ?? null,
      field: capped("field", input.field) ?? null,
      location: capped("location", input.location) ?? null,
      language: capped("language", input.language) ?? null,
      duration: capped("duration", input.duration) ?? null,
      eu_tuition: capped("eu_tuition", input.eu_tuition) ?? null,
      url: capped("url", input.url) ?? null,
      status,
      deadline: asDeadline(input.deadline),
      deadline_indicative: capped("deadline_indicative", input.deadline_indicative) ?? null,
      test_required: capped("test_required", input.test_required) ?? null,
      fit_notes: capped("fit_notes", input.fit_notes) ?? null,
      next_action: capped("next_action", input.next_action) ?? null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as Record<string, unknown>);
}

const EDITABLE = new Set([
  "kind",
  "org",
  "title",
  "field",
  "location",
  "language",
  "duration",
  "eu_tuition",
  "url",
  "status",
  "deadline",
  "deadline_indicative",
  "test_required",
  "fit_notes",
  "tailored_resume",
  "cover_letter",
  "next_action",
  "decision",
]);

export async function updateApplication(
  id: string,
  input: Record<string, unknown>,
): Promise<ApplicationDTO | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "kind" && !["masters", "job", "campus_job"].includes(String(v))) continue;
    if (k === "status" && !STATUSES.includes(v as ApplicationStatus)) continue;
    patch[k] = k === "deadline" ? asDeadline(v) : capped(k, v);
  }
  const { data, error } = await db()
    .from("applications")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data as Record<string, unknown>) : null;
}

/**
 * Draft a tailored resume summary + cover letter from the stored CV and the
 * application details. Saves both on the application for review. Never submits.
 */
export async function draftApplication(id: string): Promise<ApplicationDTO | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Drafting needs ANTHROPIC_API_KEY.");

  const { data: row, error } = await db()
    .from("applications")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;
  const app = toDTO(row as Record<string, unknown>);

  const resume = await getResume();

  const client = anthropicClient({ timeoutMs: 60_000 });
  const res = await client.messages.create({
    model: lightModel(),
    max_tokens: 1500,
    system:
      "You help Eduardo tailor applications. Using ONLY his real CV, write (1) a concise tailored resume summary (4-6 lines) and (2) a focused cover letter for the specific program/role. Be truthful to the CV — never invent credentials. Return STRICT JSON: {\"tailored_resume\": string, \"cover_letter\": string}. No prose outside the JSON.",
    messages: [
      {
        role: "user",
        content: `CV:\n${resume.full_text ?? "(none on file)"}\n\nApplication:\nKind: ${app.kind}\nOrg: ${app.org}\nTitle: ${app.title}\nField: ${app.field}\nLocation: ${app.location}\nNotes: ${app.fit_notes}\nTest required: ${app.test_required}`,
      },
    ],
  });

  const raw = textFrom(res);
  let tailored = "";
  let cover = "";
  const json = extractJson(raw) as { tailored_resume?: unknown; cover_letter?: unknown } | null;
  if (json && typeof json === "object" && !Array.isArray(json)) {
    tailored = String(json.tailored_resume ?? "");
    cover = String(json.cover_letter ?? "");
  } else {
    cover = raw; // fall back to raw text in the cover letter field
  }

  return updateApplication(id, { tailored_resume: tailored, cover_letter: cover });
}

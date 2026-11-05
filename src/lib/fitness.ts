import "server-only";

import { db, USER_ID, type WorkoutRow } from "@/lib/db";
import {
  asObject,
  optIsoDate,
  optNum,
  optStr,
  reqStr,
  ValidationError,
} from "@/lib/validate";
import type { WorkoutDTO } from "@/lib/types";

/**
 * Fitness module — workout list + the ingest seam for the external lifting
 * app (H4). Ingest upserts by (user_id, external_id) so the other app can
 * re-push the same workouts safely; manual adds carry no external_id and are
 * plain inserts. Ingest contract: see "Fitness ingest" in README.md.
 */

const MAX_BATCH = 100;
const MAX_DATA_BYTES = 20_000;

export interface WorkoutInput {
  external_id: string | null;
  name: string;
  type: string | null;
  performed_at: string;
  duration_min: number | null;
  notes: string | null;
  data: Record<string, unknown>;
  source: string;
}

function parseOne(raw: unknown, requireExternalId: boolean, defaultSource: string): WorkoutInput {
  const body = asObject(raw);
  const performedAt = optIsoDate(body.performed_at, "performed_at");
  if (!performedAt) throw new ValidationError("performed_at is required.");
  const externalId = requireExternalId
    ? reqStr(body.external_id, "external_id", 200)
    : optStr(body.external_id, "external_id", 200);
  let data: Record<string, unknown> = {};
  if (body.data != null) {
    data = asObject(body.data);
    if (JSON.stringify(data).length > MAX_DATA_BYTES) {
      throw new ValidationError(`data exceeds ${MAX_DATA_BYTES} bytes.`);
    }
  }
  return {
    external_id: externalId,
    name: reqStr(body.name, "name", 300),
    type: optStr(body.type, "type", 100),
    performed_at: performedAt,
    duration_min: optNum(body.duration_min, "duration_min", 0, 10_000),
    notes: optStr(body.notes, "notes", 5000),
    data,
    source: optStr(body.source, "source", 100) ?? defaultSource,
  };
}

/**
 * Parse an ingest body: one workout object or { workouts: [...] } (≤100).
 * external_id is required on every item — it is the idempotency key.
 */
export function parseIngestBody(raw: unknown): WorkoutInput[] {
  const body = asObject(raw);
  const items = Array.isArray(body.workouts) ? body.workouts : [body];
  if (items.length === 0) throw new ValidationError("workouts is empty.");
  if (items.length > MAX_BATCH) throw new ValidationError(`workouts exceeds ${MAX_BATCH} items.`);
  return items.map((w) => parseOne(w, true, "external"));
}

/** Parse a manual add from the Fitness tab (no external_id needed). */
export function parseManualBody(raw: unknown): WorkoutInput {
  return parseOne(raw, false, "manual");
}

function toRow(w: WorkoutInput) {
  return {
    user_id: USER_ID,
    source: w.source,
    name: w.name,
    type: w.type,
    performed_at: w.performed_at,
    duration_min: w.duration_min,
    // notes live inside the jsonb payload (no dedicated column).
    data: w.notes ? { ...w.data, notes: w.notes } : w.data,
    external_id: w.external_id,
  };
}

function toDTO(r: WorkoutRow): WorkoutDTO {
  const data = r.data && typeof r.data === "object" && !Array.isArray(r.data)
    ? (r.data as Record<string, unknown>)
    : {};
  return {
    id: r.id,
    source: r.source,
    name: r.name,
    type: r.type,
    performed_at: r.performed_at,
    duration_min: r.duration_min == null ? null : Number(r.duration_min),
    notes: typeof data.notes === "string" ? data.notes : null,
    external_id: r.external_id,
  };
}

/**
 * Keep only the last occurrence of each external_id — a repeated id within
 * one batch would abort the whole upsert ("cannot affect row a second time").
 * Pure; exported for tests.
 */
export function dedupeByExternalId(items: WorkoutInput[]): WorkoutInput[] {
  const byId = new Map(items.map((w) => [w.external_id, w]));
  return [...byId.values()];
}

/** Idempotent ingest: upsert each workout by (user_id, external_id). */
export async function ingestWorkouts(items: WorkoutInput[]): Promise<{ upserted: number }> {
  const rows = dedupeByExternalId(items).map(toRow);
  const { error } = await db()
    .from("workouts")
    .upsert(rows, { onConflict: "user_id,external_id" });
  if (error) throw new Error(error.message);
  return { upserted: rows.length };
}

export async function addWorkout(input: WorkoutInput): Promise<WorkoutDTO> {
  const { data, error } = await db()
    .from("workouts")
    .insert(toRow(input))
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as WorkoutRow);
}

export async function listWorkouts(limit = 100): Promise<WorkoutDTO[]> {
  const { data, error } = await db()
    .from("workouts")
    .select("*")
    .eq("user_id", USER_ID)
    .order("performed_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as WorkoutRow[]).map(toDTO);
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await db()
    .from("workouts")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

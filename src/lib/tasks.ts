import "server-only";

import { db, USER_ID, type TaskRow } from "@/lib/db";
import { addMemory } from "@/lib/memory";
import type { TaskDTO } from "@/lib/types";

/** Map a DB row to the client DTO, resolving the course name if known. */
export function toTaskDTO(row: TaskRow, courseName: string | null): TaskDTO {
  return {
    id: row.id,
    title: row.title,
    urgency: (row.urgency as TaskDTO["urgency"]) ?? null,
    key: row.key,
    priority_score: row.priority_score,
    time_estimate_min: row.time_estimate_min,
    domain: (row.domain as TaskDTO["domain"]) ?? null,
    done: row.completed_at != null,
    course_id: row.entity_id,
    course_name: courseName,
    due_date: row.due_date,
    due_time: row.due_time,
    created_at: row.created_at,
  };
}

/** Resolve course names for a set of rows in one query. */
export async function courseNamesFor(
  rows: TaskRow[],
): Promise<Record<string, string>> {
  const ids = [...new Set(rows.map((r) => r.entity_id).filter(Boolean))] as string[];
  if (ids.length === 0) return {};
  const { data, error } = await db()
    .from("entities")
    .select("id,name")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
}

/**
 * Insert a task and mirror it into the memory layer. Single creation path used
 * by both POST /api/tasks and the capture pipeline.
 */
export async function createTask(input: {
  title: string;
  domain?: string;
  urgency?: string;
  key?: boolean;
  tags?: string[];
  time_estimate_min?: number | null;
  entity_id?: string | null;
  /** YYYY-MM-DD — also surfaces the task on the calendar. */
  due_date?: string | null;
  /** HH:MM local wall-clock deadline time. */
  due_time?: string | null;
  /** Skip memory indexing — the capture pipeline indexes once, keyed by capture id. */
  skipMemory?: boolean;
}): Promise<TaskRow> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("tasks")
    .insert({
      user_id: USER_ID,
      title: input.title,
      domain: input.domain ?? "personal",
      urgency: input.urgency ?? "today",
      key: input.key ?? false,
      tags: input.tags ?? [],
      time_estimate_min: input.time_estimate_min ?? null,
      entity_id: input.entity_id ?? null,
      due_date: input.due_date ?? null,
      due_time: input.due_time ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const row = data as TaskRow;
  if (!input.skipMemory) {
    await addMemory({ text: row.title, sourceType: "task", sourceId: row.id });
  }
  return row;
}

interface TaskFilters {
  status?: "open" | "done" | null;
  domain?: string | null;
  urgency?: string | null;
  course?: string | null;
}

/** Fetch tasks (ranked: key first, then priority, then newest) as DTOs. */
export async function queryTasks(filters: TaskFilters): Promise<TaskDTO[]> {
  let q = db().from("tasks").select("*").eq("user_id", USER_ID);

  if (filters.domain) q = q.eq("domain", filters.domain);
  if (filters.urgency) q = q.eq("urgency", filters.urgency);
  if (filters.course) q = q.eq("entity_id", filters.course);
  if (filters.status === "open") q = q.is("completed_at", null);
  if (filters.status === "done") q = q.not("completed_at", "is", null);

  q = q
    .order("key", { ascending: false })
    .order("priority_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TaskRow[];
  const names = await courseNamesFor(rows);
  return rows.map((r) => toTaskDTO(r, r.entity_id ? names[r.entity_id] ?? null : null));
}

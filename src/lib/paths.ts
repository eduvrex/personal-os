import "server-only";

import { db, USER_ID, type Json, type PathRow } from "@/lib/db";
import { listPlans } from "@/lib/plans";
import type { Milestone, PathDTO } from "@/lib/types";

function parseMilestones(value: unknown): Milestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const m: { label: string; done: boolean; date?: string } = {
        label: String(x.label ?? ""),
        done: Boolean(x.done),
      };
      if (typeof x.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(x.date)) {
        m.date = x.date.slice(0, 10);
      }
      return m;
    })
    .filter((x) => x.label.length > 0);
}

/** Progress is always derived from completed milestones, never trusted from input. */
export function deriveProgress(milestones: Milestone[]): number {
  if (milestones.length === 0) return 0;
  const done = milestones.filter((m) => m.done).length;
  return Math.round((done / milestones.length) * 100);
}

export function toPathDTO(row: PathRow): PathDTO {
  const milestones = parseMilestones(row.milestones);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    milestones,
    progress: deriveProgress(milestones),
    status: row.status,
  };
}

export async function listPaths(): Promise<PathDTO[]> {
  // Delegate to the plans listing so progress rolls up child tracks the same
  // way /me does — the same row must not show different progress per tab.
  const plans = await listPlans();
  return plans.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    milestones: p.milestones,
    progress: p.progress,
    status: p.status,
  }));
}

export async function createPath(input: {
  title: string;
  description?: string | null;
  milestones?: Milestone[];
}): Promise<PathDTO> {
  const milestones = parseMilestones(input.milestones ?? []);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("paths")
    .insert({
      user_id: USER_ID,
      title: input.title.trim(),
      description: input.description ?? null,
      milestones,
      progress: deriveProgress(milestones),
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toPathDTO(data as PathRow);
}

export async function updatePath(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    milestones?: Milestone[];
    status?: string;
  },
): Promise<PathDTO | null> {
  const patch: Partial<PathRow> = { updated_at: new Date().toISOString() };
  if (typeof input.title === "string") patch.title = input.title.trim();
  if ("description" in input) patch.description = input.description ?? null;
  if (typeof input.status === "string") patch.status = input.status;
  if (input.milestones) {
    const milestones = parseMilestones(input.milestones);
    patch.milestones = milestones as unknown as Json;
    patch.progress = deriveProgress(milestones);
  }

  const { data, error } = await db()
    .from("paths")
    .update(patch)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toPathDTO(data as PathRow) : null;
}

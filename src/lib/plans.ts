import "server-only";

import { effectiveBalance } from "@/lib/balance";
import { db, USER_ID, type Json } from "@/lib/db";
import { deriveProgress } from "@/lib/paths";
import type { Milestone, PlanDTO } from "@/lib/types";

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

const CATEGORY_ORDER = ["academic", "career", "finance", "personal"];

function toPlanDTO(row: Record<string, unknown>): PlanDTO {
  const milestones = parseMilestones(row.milestones);
  return {
    id: String(row.id),
    parent_id: (row.parent_id as string) ?? null,
    title: String(row.title),
    description: (row.description as string) ?? null,
    milestones,
    progress: deriveProgress(milestones),
    status: (row.status as string) ?? null,
    target_date: (row.target_date as string) ?? null,
    notes: (row.notes as string) ?? null,
    savings_target: row.savings_target != null ? Number(row.savings_target) : null,
    category: (row.category as string) ?? null,
  };
}

/** Top-level plans, each with its child tracks nested under `.tracks`. */
export async function listPlans(): Promise<PlanDTO[]> {
  const { data, error } = await db()
    .from("paths")
    .select("*")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []).map((r) => toPlanDTO(r as Record<string, unknown>));
  const tops = rows.filter((p) => !p.parent_id);
  const childrenOf = (id: string) =>
    rows
      .filter((p) => p.parent_id === id)
      .sort((a, b) => {
        const ai = CATEGORY_ORDER.indexOf(a.category ?? "");
        const bi = CATEGORY_ORDER.indexOf(b.category ?? "");
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      });

  return tops.map((p) => {
    const tracks = childrenOf(p.id);
    // A plan with tracks derives its progress from the tracks' average.
    const progress = tracks.length
      ? Math.round(tracks.reduce((s, t) => s + t.progress, 0) / tracks.length)
      : p.progress;
    return { ...p, progress, tracks };
  });
}

/** Current savings = sum of depository account balances. */
export async function currentSavings(): Promise<number> {
  const { data, error } = await db()
    .from("finance_accounts")
    .select("current_balance,available_balance,type")
    .eq("user_id", USER_ID)
    .eq("type", "depository");
  if (error) return 0;
  return (data ?? []).reduce((s, a) => s + effectiveBalance(a), 0);
}

export async function createPlan(input: {
  title: string;
  parent_id?: string | null;
  category?: string | null;
  target_date?: string | null;
}): Promise<PlanDTO> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("paths")
    .insert({
      user_id: USER_ID,
      title: input.title.trim(),
      parent_id: input.parent_id ?? null,
      category: input.category ?? null,
      target_date: input.target_date ?? null,
      milestones: [],
      progress: 0,
      status: "active",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toPlanDTO(data as Record<string, unknown>);
}

export async function updatePlan(
  id: string,
  input: Record<string, unknown>,
): Promise<PlanDTO | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof input.title === "string") patch.title = input.title.trim();
  if ("notes" in input) patch.notes = input.notes ?? null;
  if ("target_date" in input) patch.target_date = input.target_date || null;
  if ("category" in input) patch.category = input.category ?? null;
  if ("status" in input) patch.status = input.status;
  if ("savings_target" in input) {
    const v = Number(input.savings_target);
    patch.savings_target = Number.isFinite(v) && v > 0 ? v : null;
  }
  if (Array.isArray(input.milestones)) {
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
  return data ? toPlanDTO(data as Record<string, unknown>) : null;
}

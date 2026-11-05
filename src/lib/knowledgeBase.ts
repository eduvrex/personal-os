import "server-only";

import { db, USER_ID, type KnowledgeBaseRow } from "@/lib/db";
import { oneOf, optNum, reqStr } from "@/lib/validate";
import type { KnowledgeItemDTO, KnowledgeTier } from "@/lib/types";

/**
 * The assistant's personal knowledge base (edited on the Me tab).
 * The Ask-my-OS answers, the advisor, and the nudge engine read this before
 * responding — but through TWO tiers:
 *
 *   - publicKnowledgeContext()  → 'public' items only. Fed to the nudge engine,
 *     whose output renders on Home, so [PRIVATE] items can never appear there.
 *   - fullKnowledgeContext()    → 'public' + 'private' items, the private ones
 *     clearly demarcated with rules. Fed only to the private-reasoning
 *     consumers: the advisor and the Ask-my-OS Q&A.
 *
 * 'private' items are advisor-only — never on Home, never in a résumé/CV, never
 * in public nudges or shared/exported views. Enforced by
 * tests/unit/knowledgeBasePrivacy.test.ts; private rows are also stripped from
 * backups/exports in src/lib/backup.ts.
 */

const TIERS = ["public", "private"] as const;

function toDTO(r: KnowledgeBaseRow): KnowledgeItemDTO {
  return {
    id: r.id,
    section: r.section,
    content: r.content,
    tier: (TIERS as readonly string[]).includes(r.tier) ? (r.tier as KnowledgeTier) : "public",
    sort: r.sort,
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for the guardrail test).
// ---------------------------------------------------------------------------

/** Only the public-tier items — the ONLY thing the public nudge engine may see. */
export function publicItems<T extends { tier: string }>(items: T[]): T[] {
  return items.filter((i) => i.tier !== "private");
}

/** Only the private-tier items. */
export function privateItems<T extends { tier: string }>(items: T[]): T[] {
  return items.filter((i) => i.tier === "private");
}

/** Group items into a readable, section-headed block for a prompt. Pure. */
export function formatKnowledge(items: { section: string; content: string }[]): string {
  const bySection = new Map<string, string[]>();
  for (const i of items) {
    bySection.set(i.section, [...(bySection.get(i.section) ?? []), i.content]);
  }
  return [...bySection.entries()]
    .map(([section, contents]) => `## ${section}\n${contents.join("\n")}`)
    .join("\n\n");
}

/** The handling rules that must accompany the private tier in any prompt. */
export const KNOWLEDGE_RULES = [
  "PRIVATE KNOWLEDGE rules:",
  "- Use it ONLY to reason and to help Eduardo directly and privately.",
  "- NEVER reproduce its specifics in anything shown on Home, in a résumé/CV, in public nudges, or in shared/exported views.",
  "- On money and health, give facts + options, never directives; give no medical or dosing advice; defer to professionals.",
].join("\n");

// ---------------------------------------------------------------------------
// Reads.
// ---------------------------------------------------------------------------

/** All items (both tiers), for the Me-tab editor. Resilient before migration. */
export async function listKnowledge(): Promise<KnowledgeItemDTO[]> {
  try {
    const { data, error } = await db()
      .from("knowledge_base")
      .select("*")
      .eq("user_id", USER_ID)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return [];
    return ((data ?? []) as KnowledgeBaseRow[]).map(toDTO);
  } catch {
    return [];
  }
}

/**
 * Public-tier knowledge for prompts whose output is or may be public (the nudge
 * engine). Returns "" when empty so callers can omit it cleanly.
 */
export async function publicKnowledgeContext(): Promise<string> {
  const pub = publicItems(await listKnowledge());
  if (pub.length === 0) return "";
  return `KNOWLEDGE BASE (general facts about Eduardo — fine to use in any response):\n${formatKnowledge(pub)}`;
}

/**
 * Full knowledge (public + private) for the PRIVATE-reasoning consumers only
 * (the advisor and the Ask-my-OS Q&A). The private block is demarcated and
 * carries KNOWLEDGE_RULES so the model never surfaces it publicly.
 */
export async function fullKnowledgeContext(): Promise<string> {
  const items = await listKnowledge();
  if (items.length === 0) return "";
  const pub = publicItems(items);
  const priv = privateItems(items);
  const parts: string[] = [];
  if (pub.length > 0) {
    parts.push(`KNOWLEDGE BASE (general facts about Eduardo):\n${formatKnowledge(pub)}`);
  }
  if (priv.length > 0) {
    parts.push(`${KNOWLEDGE_RULES}\n\nPRIVATE KNOWLEDGE (advisor-only):\n${formatKnowledge(priv)}`);
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Writes (the Me-tab editor).
// ---------------------------------------------------------------------------

export interface KnowledgeInput {
  section: string;
  content: string;
  tier: KnowledgeTier;
  sort?: number;
}

export function parseKnowledgeBody(body: Record<string, unknown>): KnowledgeInput {
  return {
    section: reqStr(body.section, "section", 120),
    content: reqStr(body.content, "content", 8000),
    tier: (oneOf(body.tier ?? "public", "tier", TIERS) ?? "public") as KnowledgeTier,
    sort: optNum(body.sort, "sort", 0, 100000) ?? undefined,
  };
}

export async function createKnowledgeItem(input: KnowledgeInput): Promise<KnowledgeItemDTO> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("knowledge_base")
    .insert({
      user_id: USER_ID,
      section: input.section,
      content: input.content,
      tier: input.tier,
      sort: input.sort ?? 0,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as KnowledgeBaseRow);
}

export async function updateKnowledgeItem(
  id: string,
  patch: Partial<KnowledgeInput>,
): Promise<KnowledgeItemDTO | null> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.section !== undefined) upd.section = patch.section;
  if (patch.content !== undefined) upd.content = patch.content;
  if (patch.tier !== undefined) upd.tier = patch.tier;
  if (patch.sort !== undefined) upd.sort = patch.sort;
  const { data, error } = await db()
    .from("knowledge_base")
    .update(upd)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data as KnowledgeBaseRow) : null;
}

export async function deleteKnowledgeItem(id: string): Promise<void> {
  const { error } = await db()
    .from("knowledge_base")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

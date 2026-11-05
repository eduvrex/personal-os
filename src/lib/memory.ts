import "server-only";

import { USER_ID } from "@/lib/userId";
import type { MemoryHitDTO } from "@/lib/types";

/**
 * Thin wrapper around the Supermemory REST API — the searchable memory layer
 * behind the Brain tab.
 *
 * Every text the user writes (captures, tasks, journal entries) is mirrored
 * here with a stable `customId` (`<sourceType>:<sourceId>`), so re-indexing is
 * idempotent and each memory carries enough metadata to cite its source.
 *
 * Writes are best-effort: if the key is unset or Supermemory is unreachable,
 * functions no-op / return empty rather than breaking the primary write.
 */

const BASE = "https://api.supermemory.ai/v3";
/** Single-user app: scope everything to one container. */
const CONTAINER = USER_ID;

export type MemorySourceType = "capture" | "task" | "journal" | "event";

/** Human-readable citation label per source type. */
const SOURCE_LABELS: Record<MemorySourceType, string> = {
  capture: "Note",
  task: "Task",
  journal: "Journal",
  event: "Calendar",
};

function labelFor(sourceType: string): string {
  return SOURCE_LABELS[sourceType as MemorySourceType] ?? "Memory";
}

function apiKey(): string | undefined {
  return process.env.SUPERMEMORY_API_KEY;
}

interface AddMemoryInput {
  text: string;
  sourceType: MemorySourceType;
  sourceId: string;
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Store (or update, via customId) one memory. Returns the document id, or null
 * if skipped/failed — callers can fire-and-forget without error handling.
 */
export async function addMemory(input: AddMemoryInput): Promise<{ id: string } | null> {
  const key = apiKey();
  const text = input.text?.trim();
  if (!key || !text) return null;

  try {
    const res = await fetch(`${BASE}/documents`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        content: text,
        containerTag: CONTAINER,
        customId: `${input.sourceType}:${input.sourceId}`,
        metadata: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceLabel: labelFor(input.sourceType),
          ...input.metadata,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("supermemory add failed", res.status, await safeText(res));
      return null;
    }
    const data = await res.json();
    return { id: String(data?.id ?? "") };
  } catch (e) {
    console.error("supermemory add error", e);
    return null;
  }
}

/** Pull the best text snippet out of a search result. */
function extractText(r: Record<string, unknown>): string {
  if (typeof r.content === "string" && r.content.trim()) return r.content.trim();
  if (Array.isArray(r.chunks)) {
    const joined = r.chunks
      .map((c) => (c && typeof c === "object" && "content" in c ? String((c as { content: unknown }).content) : ""))
      .filter(Boolean)
      .join(" ")
      .trim();
    if (joined) return joined;
  }
  if (typeof r.title === "string") return r.title;
  return "";
}

/** Semantic search over the memory layer. Returns [] when unavailable. */
export async function searchMemory(query: string, limit = 8): Promise<MemoryHitDTO[]> {
  const key = apiKey();
  const q = query?.trim();
  if (!key || !q) return [];

  try {
    const res = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      // Must scope to the same container the docs were added under, otherwise
      // container-tagged documents aren't returned.
      body: JSON.stringify({ q, limit, containerTags: [CONTAINER] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("supermemory search failed", res.status, await safeText(res));
      return [];
    }
    const data = await res.json();
    const results: Record<string, unknown>[] = Array.isArray(data?.results)
      ? data.results
      : [];
    return results
      .map((r) => {
        const metadata = (r.metadata ?? {}) as Record<string, unknown>;
        const sourceType = String(metadata.sourceType ?? "");
        return {
          documentId: String(r.documentId ?? r.id ?? ""),
          text: extractText(r),
          score: typeof r.score === "number" ? r.score : 0,
          sourceType,
          sourceId: String(metadata.sourceId ?? ""),
          sourceLabel: String(metadata.sourceLabel ?? labelFor(sourceType)),
        } satisfies MemoryHitDTO;
      })
      .filter((h) => h.text.length > 0);
  } catch (e) {
    console.error("supermemory search error", e);
    return [];
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}

/** List all stored docs (id + customId). Server-side, single-user store. */
async function listAllDocs(): Promise<{ id: string; customId: string }[]> {
  const key = apiKey();
  if (!key) return [];
  try {
    const res = await fetch(`${BASE}/documents/list`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ limit: 200 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const docs: Record<string, unknown>[] = data?.memories ?? [];
    return docs
      .filter((d) => d.customId)
      .map((d) => ({ id: String(d.id), customId: String(d.customId) }));
  } catch {
    return [];
  }
}

/**
 * Remove memory docs matching any of the given customIds. Best-effort. Used to
 * pull an item out of the memory layer (e.g. when a journal entry is marked
 * private).
 */
export async function removeMemoryByCustomIds(customIds: string[]): Promise<number> {
  const key = apiKey();
  if (!key || customIds.length === 0) return 0;
  const wanted = new Set(customIds);
  const docs = await listAllDocs();
  let removed = 0;
  for (const d of docs) {
    if (!wanted.has(d.customId)) continue;
    try {
      const res = await fetch(`${BASE}/documents/${d.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) removed++;
    } catch {
      /* best-effort */
    }
  }
  return removed;
}

import "server-only";

import { db, USER_ID, type JournalEntryRow } from "@/lib/db";
import { localDateKey } from "@/lib/localDate";
import { addMemory, removeMemoryByCustomIds } from "@/lib/memory";
import type { JournalDTO } from "@/lib/types";

function toJournalDTO(row: JournalEntryRow): JournalDTO {
  return {
    id: row.id,
    entry_date: row.entry_date,
    text: row.text,
    mood: row.mood,
    source: row.source,
    summary: row.summary,
    created_at: row.created_at,
    private: Boolean((row as unknown as Record<string, unknown>).private),
  };
}

/** Date key for `n` days before today, in the operator's timezone. */
function daysAgoKey(n: number): string {
  return localDateKey(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}

/** Journal entries within the last `days` days, newest first. */
export async function listJournal(days: number): Promise<JournalDTO[]> {
  const cutoff = daysAgoKey(days);
  const { data, error } = await db()
    .from("journal_entries")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("personal", false)
    .gte("entry_date", cutoff)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toJournalDTO(r as JournalEntryRow));
}

export async function latestJournal(): Promise<JournalDTO | null> {
  const { data, error } = await db()
    .from("journal_entries")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("personal", false)
    .eq("private", false)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toJournalDTO(data as JournalEntryRow) : null;
}

export async function addJournal(input: {
  text: string;
  mood?: string | null;
  source?: string | null;
  /** Private personal check-ins stay out of the public feed, memory, and nudges. */
  personal?: boolean;
  /** Skip memory indexing — the capture pipeline indexes once, keyed by capture id. */
  skipMemory?: boolean;
  /** Public entry marked private: hidden from the Home preview, kept on the Reflect tab. */
  private?: boolean;
}): Promise<JournalDTO> {
  const personal = input.personal ?? false;
  const { data, error } = await db()
    .from("journal_entries")
    .insert({
      user_id: USER_ID,
      entry_date: localDateKey(),
      text: input.text.trim(),
      mood: input.mood ?? null,
      source: input.source ?? (personal ? "personal" : "text"),
      personal,
      private: input.private ?? false,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const dto = toJournalDTO(data as JournalEntryRow);
  // Never index personal or private entries; the capture pipeline indexes once
  // by capture id.
  if (!personal && !(input.private ?? false) && !input.skipMemory) {
    await addMemory({
      text: dto.text ?? input.text,
      sourceType: "journal",
      sourceId: dto.id,
    });
  }
  return dto;
}

/**
 * Toggle the `private` flag on a public journal entry. Private means fully
 * private: the entry is removed from the memory layer (so it drops out of Brain
 * search and the nudge inputs) and shows only on the Reflect tab. Un-marking
 * re-indexes it for search.
 */
export async function setJournalPrivate(
  id: string,
  isPrivate: boolean,
): Promise<void> {
  const { error } = await db()
    .from("journal_entries")
    .update({ private: isPrivate })
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (isPrivate) {
    // Remove from memory — cover both entry-keyed (Reflect-written) and
    // capture-keyed (routed from a capture) docs.
    const customIds = [`journal:${id}`];
    const caps = await db()
      .from("raw_captures")
      .select("id")
      .eq("user_id", USER_ID)
      .eq("routed_id", id);
    for (const c of caps.data ?? []) {
      customIds.push(`journal:${c.id}`, `capture:${c.id}`);
    }
    await removeMemoryByCustomIds(customIds);
  } else {
    // Made public again → re-index for search.
    const { data } = await db()
      .from("journal_entries")
      .select("text")
      .eq("user_id", USER_ID)
      .eq("id", id)
      .maybeSingle();
    const text = ((data?.text as string) ?? "").trim();
    if (text) await addMemory({ text, sourceType: "journal", sourceId: id });
  }
}

/** Private personal check-ins (personal=true), newest first. */
export async function listPersonal(days: number): Promise<JournalDTO[]> {
  const cutoff = daysAgoKey(days);
  const { data, error } = await db()
    .from("journal_entries")
    .select("*")
    .eq("user_id", USER_ID)
    .eq("personal", true)
    .gte("entry_date", cutoff)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => toJournalDTO(r as JournalEntryRow));
}

import "server-only";

import { db, USER_ID, type ReadingBookRow } from "@/lib/db";
import { localDateKey } from "@/lib/localDate";
import { oneOf, optNum, optStr, reqStr } from "@/lib/validate";
import type { ReadingBookDTO, ReadingListDTO, ReadingStatus } from "@/lib/types";

/**
 * Reading tracker: a want /
 * reading / finished list, progress per book (page or %), short notes, and a
 * count of books finished.
 */

const STATUSES = ["want", "reading", "finished"] as const;

/** 0–100 from page counts when present, else the stored percent, else null. Pure. */
export function deriveReadingProgress(
  current_page: number | null,
  total_pages: number | null,
  progress_pct: number | null,
  status?: string,
): number | null {
  if (status === "finished") return 100;
  if (current_page != null && total_pages && total_pages > 0) {
    return Math.max(0, Math.min(100, Math.round((current_page / total_pages) * 100)));
  }
  if (progress_pct != null) return Math.max(0, Math.min(100, Math.round(progress_pct)));
  return null;
}

function toDTO(r: ReadingBookRow): ReadingBookDTO {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    status: (STATUSES as readonly string[]).includes(r.status)
      ? (r.status as ReadingStatus)
      : "want",
    current_page: r.current_page == null ? null : Number(r.current_page),
    total_pages: r.total_pages == null ? null : Number(r.total_pages),
    progress: deriveReadingProgress(
      r.current_page == null ? null : Number(r.current_page),
      r.total_pages == null ? null : Number(r.total_pages),
      r.progress_pct == null ? null : Number(r.progress_pct),
      r.status,
    ),
    notes: r.notes,
    started_on: r.started_on,
    finished_on: r.finished_on,
  };
}

const STATUS_ORDER: Record<string, number> = { reading: 0, want: 1, finished: 2 };

/** All books, reading first then want then finished, with a finished count. */
export async function listReading(): Promise<ReadingListDTO> {
  try {
    const { data, error } = await db()
      .from("reading_books")
      .select("*")
      .eq("user_id", USER_ID);
    if (error) return { books: [], finishedCount: 0 };
    const books = ((data ?? []) as ReadingBookRow[]).map(toDTO).sort((a, b) => {
      const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      if (so !== 0) return so;
      // Newest finished first; otherwise by title.
      if (a.status === "finished") return (b.finished_on ?? "").localeCompare(a.finished_on ?? "");
      return a.title.localeCompare(b.title);
    });
    return { books, finishedCount: books.filter((b) => b.status === "finished").length };
  } catch {
    return { books: [], finishedCount: 0 };
  }
}

export interface BookInput {
  title: string;
  author: string | null;
  status: ReadingStatus;
  current_page: number | null;
  total_pages: number | null;
  progress_pct: number | null;
  notes: string | null;
}

export function parseBookBody(body: Record<string, unknown>): BookInput {
  return {
    title: reqStr(body.title, "title", 300),
    author: optStr(body.author, "author", 200),
    status: (oneOf(body.status ?? "want", "status", STATUSES) ?? "want") as ReadingStatus,
    current_page: optNum(body.current_page, "current_page", 0, 100_000),
    total_pages: optNum(body.total_pages, "total_pages", 0, 100_000),
    progress_pct: optNum(body.progress_pct, "progress_pct", 0, 100),
    notes: optStr(body.notes, "notes", 4000),
  };
}

export async function addBook(input: BookInput): Promise<ReadingBookDTO> {
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("reading_books")
    .insert({
      user_id: USER_ID,
      title: input.title,
      author: input.author,
      status: input.status,
      current_page: input.current_page,
      total_pages: input.total_pages,
      progress_pct: input.progress_pct,
      notes: input.notes,
      started_on: input.status === "reading" ? localDateKey() : null,
      finished_on: input.status === "finished" ? localDateKey() : null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data as ReadingBookRow);
}

export async function updateBook(
  id: string,
  patch: Partial<BookInput>,
): Promise<ReadingBookDTO | null> {
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) upd.title = patch.title;
  if (patch.author !== undefined) upd.author = patch.author;
  if (patch.current_page !== undefined) upd.current_page = patch.current_page;
  if (patch.total_pages !== undefined) upd.total_pages = patch.total_pages;
  if (patch.progress_pct !== undefined) upd.progress_pct = patch.progress_pct;
  if (patch.notes !== undefined) upd.notes = patch.notes;
  if (patch.status !== undefined) {
    upd.status = patch.status;
    // Stamp lifecycle dates as the book moves through the list.
    if (patch.status === "reading") upd.started_on = localDateKey();
    if (patch.status === "finished") upd.finished_on = localDateKey();
  }
  const { data, error } = await db()
    .from("reading_books")
    .update(upd)
    .eq("user_id", USER_ID)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data as ReadingBookRow) : null;
}

export async function deleteBook(id: string): Promise<void> {
  const { error } = await db()
    .from("reading_books")
    .delete()
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

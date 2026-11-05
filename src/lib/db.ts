import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { USER_ID } from "@/lib/userId";

/**
 * Shared, typed data-access layer.
 *
 * This is the single place the rest of the app reaches Supabase through. It
 * mirrors the existing database schema (do NOT change the schema here — these
 * types must follow the tables, not the other way around) and exposes a typed
 * service-role client via {@link db}.
 */

/** A JSON value, as stored in `jsonb` columns. */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ---------------------------------------------------------------------------
// Row types — one per table, matching the live schema exactly.
// ---------------------------------------------------------------------------

export interface EntityRow {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  metadata: Json;
  created_at: string;
}

export interface RawCaptureRow {
  id: string;
  user_id: string;
  source: string | null;
  raw_text: string | null;
  audio_url: string | null;
  classification: Json | null;
  llm_source: string | null;
  routed_to: string | null;
  routed_id: string | null;
  status: string;
  confidence: number | null;
  created_at: string;
}

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  urgency: string | null;
  key: boolean;
  priority_score: number | null;
  time_estimate_min: number | null;
  tags: string[];
  due_date: string | null;
  due_time: string | null;
  domain: string | null;
  entity_id: string | null;
  owner: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaptureArtifactRow {
  id: string;
  user_id: string;
  capture_id: string;
  item_index: number;
  route: string;
  routed_id: string | null;
  extraction: Json;
  created_at: string;
}

export interface TelegramUpdateRow {
  update_id: number;
  user_id: string;
  status: string;
  capture_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyLogRow {
  id: string;
  user_id: string;
  log_date: string;
  notes: string | null;
  mood: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  text: string | null;
  mood: string | null;
  source: string | null;
  summary: string | null;
  created_at: string;
}

export interface PathRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  milestones: Json;
  progress: number;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryChunkRow {
  id: string;
  user_id: string;
  source_type: string | null;
  source_id: string | null;
  text: string | null;
  embedding: number[] | null;
  created_at: string;
}

export interface WorkoutRow {
  id: string;
  user_id: string;
  source: string;
  name: string;
  type: string | null;
  performed_at: string;
  duration_min: number | null;
  data: Json;
  external_id: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface RhythmBlockRow {
  id: string;
  user_id: string;
  at_time: string | null;
  label: string;
  detail: string | null;
  kind: string | null;
  days: Json;
  sort: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeditationSessionRow {
  id: string;
  user_id: string;
  session_date: string;
  duration_sec: number;
  note: string | null;
  created_at: string;
}

export interface ReadingBookRow {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  status: string;
  current_page: number | null;
  total_pages: number | null;
  progress_pct: number | null;
  notes: string | null;
  started_on: string | null;
  finished_on: string | null;
  sort: number;
  created_at: string;
  updated_at: string;
}

/**
 * Assistant knowledge base row. `tier` gates privacy: 'private' rows are
 * advisor-only and never reach Home, résumés, public nudges, or exports.
 */
export interface KnowledgeBaseRow {
  id: string;
  user_id: string;
  section: string;
  content: string;
  tier: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

/**
 * An insert payload: `Required` keys are mandatory, everything else is optional
 * (the database fills it via default or it is nullable).
 */
type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

// ---------------------------------------------------------------------------
// Database shape for the typed Supabase client.
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      entities: {
        Row: EntityRow;
        Insert: Insertable<EntityRow, "user_id" | "name" | "kind">;
        Update: Partial<EntityRow>;
        Relationships: [];
      };
      raw_captures: {
        Row: RawCaptureRow;
        Insert: Insertable<RawCaptureRow, "user_id">;
        Update: Partial<RawCaptureRow>;
        Relationships: [];
      };
      capture_artifacts: {
        Row: CaptureArtifactRow;
        Insert: Insertable<CaptureArtifactRow, "user_id" | "capture_id" | "item_index" | "route">;
        Update: Partial<CaptureArtifactRow>;
        Relationships: [];
      };
      telegram_updates: {
        Row: TelegramUpdateRow;
        Insert: Insertable<TelegramUpdateRow, "update_id" | "user_id">;
        Update: Partial<TelegramUpdateRow>;
        Relationships: [];
      };
      tasks: {
        Row: TaskRow;
        Insert: Insertable<TaskRow, "user_id" | "title">;
        Update: Partial<TaskRow>;
        Relationships: [];
      };
      daily_logs: {
        Row: DailyLogRow;
        Insert: Insertable<DailyLogRow, "user_id" | "log_date">;
        Update: Partial<DailyLogRow>;
        Relationships: [];
      };
      journal_entries: {
        Row: JournalEntryRow;
        Insert: Insertable<JournalEntryRow, "user_id" | "entry_date">;
        Update: Partial<JournalEntryRow>;
        Relationships: [];
      };
      paths: {
        Row: PathRow;
        Insert: Insertable<PathRow, "user_id" | "title" | "milestones" | "progress">;
        Update: Partial<PathRow>;
        Relationships: [];
      };
      memory_chunks: {
        Row: MemoryChunkRow;
        Insert: Insertable<MemoryChunkRow, "user_id">;
        Update: Partial<MemoryChunkRow>;
        Relationships: [];
      };
      workouts: {
        Row: WorkoutRow;
        Insert: Insertable<WorkoutRow, "user_id" | "name" | "performed_at">;
        Update: Partial<WorkoutRow>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLogRow;
        Insert: Insertable<AuditLogRow, "user_id" | "action">;
        Update: Partial<AuditLogRow>;
        Relationships: [];
      };
      rhythm_blocks: {
        Row: RhythmBlockRow;
        Insert: Insertable<RhythmBlockRow, "user_id" | "label">;
        Update: Partial<RhythmBlockRow>;
        Relationships: [];
      };
      meditation_sessions: {
        Row: MeditationSessionRow;
        Insert: Insertable<MeditationSessionRow, "user_id" | "session_date">;
        Update: Partial<MeditationSessionRow>;
        Relationships: [];
      };
      reading_books: {
        Row: ReadingBookRow;
        Insert: Insertable<ReadingBookRow, "user_id" | "title">;
        Update: Partial<ReadingBookRow>;
        Relationships: [];
      };
      knowledge_base: {
        Row: KnowledgeBaseRow;
        Insert: Insertable<KnowledgeBaseRow, "user_id" | "section" | "content">;
        Update: Partial<KnowledgeBaseRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** Table names available on the typed client. */
export type TableName = keyof Database["public"]["Tables"];

// ---------------------------------------------------------------------------
// Client accessor + helpers.
// ---------------------------------------------------------------------------

let cached: SupabaseClient | null = null;

/**
 * The service-role Supabase client, cached for the lifetime of the server
 * process. Server-only.
 *
 * The client itself is intentionally left untyped: postgrest-js's deep
 * insert/update generics fight hand-written schema types and collapse write
 * payloads to `never`. Instead we keep the {@link Database} row types as the
 * source of truth and cast at our own helper boundaries (see `lib/tasks.ts`
 * etc.), which is where the type safety actually matters.
 */
export function db(): SupabaseClient {
  if (!cached) cached = createClient();
  return cached;
}

/**
 * Unwraps a PostgREST response, throwing on error so callers get the data
 * directly instead of threading `{ data, error }` everywhere.
 */
export function unwrap<T>(res: { data: T | null; error: PostgrestError | null }): T {
  if (res.error) {
    throw new Error(`Supabase error: ${res.error.message}`);
  }
  // A successful single-row/maybe query can legitimately return null; callers
  // that need non-null should narrow. Multi-row selects return [] not null.
  return res.data as T;
}

/** Re-exported for convenience so callers can `import { db, USER_ID }`. */
export { USER_ID };

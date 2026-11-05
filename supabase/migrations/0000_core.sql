-- 0000 — Core tables: tasks, plans, daily logs, journal, captures, memory, audit.
--
-- These tables predate the numbered migrations (they were first created by hand
-- in the Supabase SQL editor). This file reconstructs them from the typed row
-- definitions in src/lib/db.ts so a fresh project can be set up from the repo
-- alone. Columns added by later migrations (paths.target_date, tasks.due_time,
-- raw_captures.status, journal_entries.private, …) are left to those files.
--
-- Same posture as every other table: RLS enabled with NO policies (deny-all to
-- client roles); the server's service_role key bypasses. Idempotent.

create extension if not exists pgcrypto;

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  kind text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists entities_user_kind_idx on entities(user_id, kind);

create table if not exists raw_captures (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text,
  raw_text text,
  audio_url text,
  classification jsonb,
  llm_source text,
  routed_to text,
  routed_id text,
  created_at timestamptz not null default now()
);
create index if not exists raw_captures_user_created_idx on raw_captures(user_id, created_at desc);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  urgency text,
  key boolean not null default false,
  priority_score numeric,
  time_estimate_min integer,
  tags text[] not null default '{}',
  due_date date,
  domain text,
  entity_id uuid references entities(id) on delete set null,
  owner text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_user_open_idx on tasks(user_id, completed_at, due_date);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  log_date date not null,
  notes text,
  mood text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  entry_date date not null,
  text text,
  mood text,
  source text,
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists journal_entries_user_date_idx on journal_entries(user_id, entry_date desc);

create table if not exists paths (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  description text,
  milestones jsonb not null default '[]'::jsonb,
  progress numeric not null default 0,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source_type text,
  source_id text,
  text text,
  embedding double precision[],
  created_at timestamptz not null default now()
);
create index if not exists memory_chunks_user_source_idx on memory_chunks(user_id, source_type, source_id);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table entities enable row level security;
alter table raw_captures enable row level security;
alter table tasks enable row level security;
alter table daily_logs enable row level security;
alter table journal_entries enable row level security;
alter table paths enable row level security;
alter table memory_chunks enable row level security;
alter table audit_log enable row level security;

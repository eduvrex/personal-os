-- 0002 Second Brain: profile, resume, plans (paths) additions, nudges,
-- applications, personal journal flag. New tables get RLS deny-all (service role
-- bypasses). Seeds are idempotent (ON CONFLICT / guarded DO block).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

create table if not exists profile (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  current_city text,
  target_city text,
  target_date date,
  occupation text,
  studies text,
  languages jsonb not null default '[]'::jsonb,
  residency_status text,
  about text,
  key_dates jsonb not null default '[]'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists resume (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  full_text text,
  structured jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Extend paths into "plans".
alter table paths add column if not exists target_date date;
alter table paths add column if not exists notes text;
alter table paths add column if not exists savings_target numeric;
alter table paths add column if not exists category text;
alter table paths add column if not exists parent_id uuid references paths(id) on delete cascade;
create index if not exists paths_parent_idx on paths(parent_id);

create table if not exists nudges (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  text text not null,
  plan_id uuid references paths(id) on delete set null,
  priority integer not null default 0,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dismissed boolean not null default false
);
create index if not exists nudges_user_idx on nudges(user_id, dismissed, priority desc);

create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  kind text not null check (kind in ('masters','job','campus_job')),
  org text,
  title text,
  field text,
  location text,
  language text,
  duration text,
  eu_tuition text,
  url text,
  status text not null default 'researching'
    check (status in ('researching','applying','applied','interview','decision')),
  deadline date,
  deadline_indicative text,
  test_required text,
  fit_notes text,
  tailored_resume text,
  cover_letter text,
  next_action text,
  decision text,
  updated_at timestamptz not null default now()
);
create unique index if not exists applications_user_org_title_uidx on applications(user_id, org, title);
create index if not exists applications_user_status_idx on applications(user_id, status);

-- Personal check-ins reuse journal_entries, flagged so they stay separate from
-- public work reflections.
alter table journal_entries add column if not exists personal boolean not null default false;

-- RLS: deny-all to client roles on new tables; service_role bypasses.
alter table profile enable row level security;
alter table resume enable row level security;
alter table nudges enable row level security;
alter table applications enable row level security;

-- Seed data is not part of the schema. For a demo dataset see supabase/seed/demo.sql.

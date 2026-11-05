-- 0004: full calendar — manual events + categories. RLS deny-all (service role
-- bypasses). Uses starts_at/ends_at (avoids the reserved word "end").

create extension if not exists pgcrypto;

create table if not exists event_categories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  color text not null,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists event_categories_user_name_uidx
  on event_categories(user_id, name);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  category text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  notes text,
  source text not null default 'manual',
  source_id text,
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calendar_events_user_start_idx
  on calendar_events(user_id, starts_at);

alter table event_categories enable row level security;
alter table calendar_events enable row level security;

-- Seed the default categories (distinct colors), idempotent.
insert into event_categories (user_id, name, color) values
  ('eduardo', 'School — Assignments', '#4f9dde'),
  ('eduardo', 'School — Exams / Projects', '#e0607e'),
  ('eduardo', 'Work — Deliverables', '#d9a441'),
  ('eduardo', 'Personal — Goal dates', '#41d4c2'),
  ('eduardo', 'Application deadlines', '#ef6f6f'),
  ('eduardo', 'Key dates', '#a78bfa'),
  ('eduardo', 'General', '#8a9ba8')
on conflict (user_id, name) do nothing;

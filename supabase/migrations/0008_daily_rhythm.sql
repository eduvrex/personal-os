-- 0008 — Daily Rhythm: editable routine blocks, meditation log, reading list.
--
-- SCHEMA ONLY. Personal seed data (the default rhythm) is applied separately
-- and is deliberately NOT checked into the repo — same posture as 0007.
--
-- Same RLS posture as every other table: enabled with NO policies (deny-all to
-- client roles); the server's service_role key bypasses. Idempotent throughout.

-- ---------------------------------------------------------------------------
-- Daily Rhythm — a humane, fully editable routine.
-- ---------------------------------------------------------------------------
-- `at_time` is HH:MM (nullable = an unscheduled/anytime block). `days` is a
-- jsonb array of lowercase 3-letter weekdays; [] means every day (e.g. the
-- Sunday weekly review stores ["sun"]). `kind` is a neutral style/label tag.
create table if not exists rhythm_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  at_time text,
  label text not null,
  detail text,
  kind text,
  days jsonb not null default '[]'::jsonb,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rhythm_blocks_user_idx
  on rhythm_blocks(user_id, sort, at_time);

-- ---------------------------------------------------------------------------
-- Meditation sessions — timer log + gentle streak.
-- ---------------------------------------------------------------------------
create table if not exists meditation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  session_date date not null,
  duration_sec integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists meditation_sessions_user_date_idx
  on meditation_sessions(user_id, session_date desc);

-- ---------------------------------------------------------------------------
-- Reading list — want / reading / finished, progress per book.
-- ---------------------------------------------------------------------------
create table if not exists reading_books (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null,
  author text,
  status text not null default 'want'
    check (status in ('want', 'reading', 'finished')),
  current_page integer,
  total_pages integer,
  progress_pct numeric,
  notes text,
  started_on date,
  finished_on date,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reading_books_user_idx
  on reading_books(user_id, status, sort);

-- ---------------------------------------------------------------------------
-- RLS: deny-all to client roles; the server's service_role bypasses.
-- ---------------------------------------------------------------------------
alter table rhythm_blocks enable row level security;
alter table meditation_sessions enable row level security;
alter table reading_books enable row level security;

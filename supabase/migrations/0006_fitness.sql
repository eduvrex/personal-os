-- 0006: Fitness — workout mirror.
--
-- Same posture as every other table: RLS enabled with NO policies (deny-all to
-- client roles); the server's service_role key bypasses. Idempotent.

-- Workouts: manual adds + idempotent ingest from the external lifting
-- app. external_id is the ingest upsert key (nullable for manual rows; Postgres
-- treats NULLs as distinct so manual inserts never conflict).
create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  source text not null default 'manual',
  name text not null,
  type text,
  performed_at timestamptz not null,
  duration_min numeric,
  data jsonb not null default '{}'::jsonb,
  external_id text,
  created_at timestamptz not null default now()
);
create unique index if not exists workouts_user_external_uidx
  on workouts(user_id, external_id);
create index if not exists workouts_user_performed_idx
  on workouts(user_id, performed_at desc);

-- RLS: deny-all to client roles; service_role bypasses.
alter table workouts enable row level security;

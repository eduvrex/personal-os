-- Capture engine v3: inbox tasks, timed deadlines, multi-artifact routing,
-- confidence/clarification state, and Telegram webhook idempotency.

-- Undated captured actions belong in an inbox instead of silently becoming
-- today's work. Replace the legacy urgency check if the base schema has it.
alter table tasks drop constraint if exists tasks_urgency_check;
alter table tasks add constraint tasks_urgency_check
  check (urgency is null or urgency in ('inbox','today','week','later'));
alter table tasks add column if not exists due_time time;

alter table raw_captures add column if not exists status text not null default 'processed';
alter table raw_captures add column if not exists confidence numeric;
alter table raw_captures drop constraint if exists raw_captures_status_check;
alter table raw_captures add constraint raw_captures_status_check
  check (status in ('pending','processing','processed','failed')) not valid;

-- One raw utterance can produce several independently routed artifacts.
create table if not exists capture_artifacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  capture_id uuid not null references raw_captures(id) on delete cascade,
  item_index integer not null,
  route text not null,
  routed_id uuid,
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (capture_id, item_index)
);
create index if not exists capture_artifacts_capture_idx
  on capture_artifacts(user_id, capture_id, item_index);

-- Claim Telegram update ids before doing work. The primary key makes webhook
-- delivery retries and concurrent invocations safe.
create table if not exists telegram_updates (
  update_id bigint primary key,
  user_id text not null,
  status text not null default 'processing'
    check (status in ('processing','processed','failed')),
  capture_id uuid references raw_captures(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table capture_artifacts enable row level security;
alter table telegram_updates enable row level security;

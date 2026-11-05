-- 0013: Rhythm pings — Telegram block nudges + one-tap check-ins.
-- The 5-minute scheduler (pg_cron -> /api/cron/reminders) sends a "starting"
-- nudge before focus / commute / review blocks and a "how did it go?" check-in
-- after focus blocks. One row per (day, block, kind); the unique key makes
-- every tick idempotent. `outcome` is filled when he taps ✅ / ½ / ❌.
create table if not exists rhythm_pings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  ping_date date not null,
  block_id uuid not null,
  kind text not null check (kind in ('start', 'checkin')),
  label text not null,
  planned_start text,
  planned_end text,
  sent_at timestamptz not null default now(),
  outcome text check (outcome in ('done', 'partial', 'skipped')),
  answered_at timestamptz,
  unique (user_id, ping_date, block_id, kind)
);
create index if not exists rhythm_pings_user_date_idx
  on rhythm_pings(user_id, ping_date desc);

alter table rhythm_pings enable row level security;

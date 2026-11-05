-- 0012: multi-provider calendar feed ingestion (Google + Microsoft/Outlook + any ICS)
-- Feed URLs are capability URLs (anyone holding one can read the calendar), so
-- they are encrypted at rest with the app key (src/lib/crypto.ts) and never
-- leave the server: the DTO carries name/provider/status only.
create table if not exists calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  provider text not null default 'other', -- 'google' | 'microsoft' | 'other' (labeling only)
  url_encrypted text not null,
  color text,
  visible boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table calendar_feeds enable row level security;

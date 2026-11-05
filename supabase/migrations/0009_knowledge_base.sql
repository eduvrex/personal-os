-- 0009 — Assistant personal knowledge base.
--
-- SCHEMA ONLY. The knowledge content itself is personal data, applied
-- separately in the SQL Editor and deliberately NOT checked into the repo
-- (same posture as 0007/0008). Idempotent; RLS deny-all (service_role bypasses).
--
-- The assistant reads this before answering. PRIVACY TIER (top priority):
--   * tier = 'public'  → general assistant use; may appear in nudges/answers.
--   * tier = 'private' → ADVISOR-ONLY. Never shown on Home, never used in a
--     résumé/CV draft, never surfaced in public nudges or shared/exported views.
--     Only the private-reasoning consumers (the advisor + the Ask-my-OS Q&A)
--     read private items; the public nudge engine reads only 'public' rows.
--   Enforced structurally by tests/unit/knowledgeBasePrivacy.test.ts, and
--   private rows are stripped from backups/exports in src/lib/backup.ts.

create table if not exists knowledge_base (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  section text not null,
  content text not null,
  tier text not null default 'public'
    check (tier in ('public', 'private')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_base_user_idx
  on knowledge_base(user_id, sort);

alter table knowledge_base enable row level security;

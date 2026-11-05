-- 0007 — Profile extensions: private academic context + applications realism.
-- Schema only; the personal seed data is applied separately in the SQL
-- Editor and is deliberately not checked into the repo.

-- ADVISOR-ONLY academic context. Deliberately excluded from ProfileDTO,
-- from /api/profile updates, and from every resume/briefing/export path
-- (enforced by tests/unit/academicPrivacy.test.ts). Sole reader:
-- src/lib/academicContext.ts, consumed only by the Next-Steps assistant.
alter table profile
  add column if not exists academic_context_private text;

-- Applications realism tag (reach / target / safety).
alter table applications
  add column if not exists realism text
  check (realism is null or realism in ('reach', 'target', 'safety'));

-- 0011: timed task reminders (Telegram pings at due_time)
-- tasks.reminded_at stamps a sent reminder so the 5-minute scheduler tick
-- (pg_cron -> /api/cron/reminders) is idempotent and never double-sends.
alter table tasks add column if not exists reminded_at timestamptz;

comment on column tasks.reminded_at is
  'Set when the Telegram reminder for due_date+due_time was sent (see src/lib/reminders.ts).';

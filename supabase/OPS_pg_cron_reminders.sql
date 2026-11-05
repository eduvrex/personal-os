-- OPS: schedule the 5-minute reminder tick from inside Supabase.
-- Vercel hobby crons are daily-only, so the database is the scheduler:
-- pg_cron fires every 5 minutes and pg_net GETs the app's reminder endpoint
-- with the cron bearer. Replace __CRON_SECRET__ with the value from .env.local
-- before running (a filled copy is generated for you outside the repo —
-- never commit the real secret). Paste into the Supabase SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-schedule idempotently.
do $$
begin
  perform cron.unschedule('personal-os-reminders');
exception when others then null;
end $$;

select cron.schedule(
  'personal-os-reminders',
  '*/5 * * * *',
  $$
  select net.http_get(
    url := 'https://<your-app>.vercel.app/api/cron/reminders',
    headers := '{"Authorization": "Bearer __CRON_SECRET__"}'::jsonb
  )
  $$
);

-- Verify: select jobname, schedule, active from cron.job;

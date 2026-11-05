/**
 * Non-/api mirror of GET /api/cron/reminders (see that route + opsToken.ts).
 * pg_cron keeps using the /api path (pg_net sends headers fine); this mirror
 * exists for web_fetch-class callers, which refuse "/api/" URLs.
 */
export { GET, maxDuration } from "@/app/api/cron/reminders/route";

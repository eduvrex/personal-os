# Architecture map

Read this before exploring — it replaces most codebase discovery. One-line-per-thing map of a
single-user "Personal OS" dashboard. Stack: **Next.js 15 App Router + React 19 + Tailwind 4
(CSS-first config in `globals.css`) + Supabase (Postgres) + Plaid + Anthropic/OpenAI**, deployed on
Vercel. TypeScript everywhere; path alias `@/*` → `src/*`.

## Repo layout

`src/` app code · `supabase/migrations/` schema (+ `supabase/seed/demo.sql`, a fictional demo
dataset) · `tests/{unit,e2e}` · `scripts/` the migration runner + the two Gmail Apps Script
forwarders · `design/{ds-bundle,prototypes}` visual source material ·
`inbox/` the drop folder for syllabi and documents to ingest. The project root holds config plus
`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md` and nothing else.

## How a feature flows

Client component (`src/components/dashboard/*Board.tsx`) → fetches JSON with `useResource` /
`sendJSON` from `src/lib/api.ts` → route handler in `src/app/api/<area>/route.ts` (thin: validate
via `src/lib/validate.ts`, call a `src/lib/<area>.ts` module) → lib module does the real work
against Supabase via `src/lib/db.ts` / `src/lib/supabase/server.ts`. Pages under
`src/app/(dashboard)/*/page.tsx` are mostly one-line wrappers that render a Board component inside
the shared `Shell`.

## Routes (tabs → boards)

`/` Home — while lock-in mode is active (`src/lib/config/lockin.ts`: `enabled` + `start`..`end`) it
renders LockInBoard (next-exam countdown hero, daily non-negotiables + full-day streak, one-time
unblockers, rules, due-today school tasks, next-7-days runway, key-date countdown; state via
`/api/lockin` → `src/lib/lockin.ts`, stored in daily_logs notes `lockin` / sentinel-day
`lockin_unblock`; carries NO grades/GPA/standing — `tests/unit/lockin.test.ts`), otherwise the
HomeDashboard (Operator, TodayRhythm, NextSteps, TodayTop3, FinancePulse, HabitTracker, SchoolAssignments,
GoalsSnapshot, Brain, Reflect) · `/home` HomeDashboard, always · `/rhythm` RhythmBoard (RhythmWeek "Day by day" timeline + editable daily rhythm + meditation
timer/streak + reading list) · `/calendar` FullCalendar
views incl. year agenda · `/goals` GoalsBoard + PlansSection (incl. the seeded Akrov project) ·
`/habits` HabitsBoard (streak stats, 12-week heat grid, per-habit strips) · `/school` SchoolBoard
(HQ view: a dated **Runway** of graded work grouped by week and built from calendar events —
exams render as timed rows with an ember rule, coursework as all-day dots — then expandable course
cards carrying syllabus metadata, then a single-column wrapping task list; Canvas sync below) · `/apply` ApplicationsBoard (master's/job applications, DOCX
export, AI drafts) · `/akrov` AkrovBoard (venture HQ: Gmail-fed email inbox with convert-to-task/
dismiss + akrov-domain task lanes; feed contract below) · `/tasks` TasksBoard (every open task
across domains in Today/Week/Later/Inbox lanes) · `/finance` FinanceBoard (Plaid accounts, cards, net worth behind PIN lock) ·
`/spending` SpendingBoard (categories, budgets, overrides) · `/wishlist` WishlistBoard (wish list gated by a
monthly cap — `wishlist.ts` + pure `wishlistMath.ts`, tables `wishlist_items`/`wishlist_settings` (0014)) · `/brain` BrainBoard (captures/memory
search) · `/reflect` ReflectBoard (journal + AI summaries) ·
`/fitness` FitnessBoard (workouts; ingest seam for the external lifting app) ·
`/me` profile, **Knowledge Base editor** (tiered assistant KB), resume + tailoring, connections,
backups. `/login` is the only public page.

## Auth & middleware (`src/middleware.ts`, `src/lib/auth/session.ts`)

Single shared password (`DASHBOARD_PASSWORD`) → signed session cookie (`AUTH_SECRET`). Everything
except `/login`, `/api/auth/*`, `/api/telegram/*` requires the cookie. Vercel Cron reaches an
allowlisted set of endpoints with `Bearer CRON_SECRET`. The external lifting app may POST
`/api/fitness/workouts` (only that path+method) with `Bearer FITNESS_INGEST_SECRET` — idempotent
upsert by external_id (contract in README.md → Fitness ingest). The Akrov Gmail forwarder
(`scripts/akrov-email-feed.gs`, Apps Script on the Akrov account) may POST `/api/akrov/ingest`
(only that path+method) with `Bearer AKROV_INGEST_SECRET` — items {id, subject, from, date,
snippet} land in `entities` kind `akrov_email`, idempotent by Gmail message id (`src/lib/akrov.ts`).
The job-search Gmail forwarder (`scripts/job-email-feed.gs`, Apps Script on the job-search account)
mirrors that contract on `/api/jobs/ingest` with `Bearer JOBS_INGEST_SECRET` — same item shape,
landing in `entities` kind `job_email` (`src/lib/jobEmails.ts`). It adds matching: each fresh item
is scored against `applications.org`, primarily on the sender's registrable domain
(`unir.net` → "unir") and secondarily on a distinctive 5+ character token in the display name or
subject, with corporate filler ("solutions", "grupo", "barcelona", …) stoplisted and 4-character
tokens allowed only through the domain. A hit stores `application_id`/`matched_org` on the item and
fires a best-effort Telegram alert (`alertMatched`) — matching never mutates the application row,
so status changes stay manual. Lane + actions live on `/apply` (convert to a `work` task tagged
`job-search`, dismiss, or re-link via PATCH `/api/jobs/emails/[id]`).
Board marketing (`push.infojobs.net`, `comms.infojobs.net`, LinkedIn/Indeed
alerts, Google account notices) is auto-dismissed on arrival — but never when
the item matched an application, since recruiters do write from board-hosted
addresses. `triageJobEmails()` runs inside `/api/cron/daily`: it re-matches
items against applications added since they arrived, dismisses noise, and reads
an outcome (`classifyOutcome`, ES+EN, rejection tested first so a rejection
letter that mentions "entrevista" is not misread) to move the application to
`decision` or `interview`, recording the triggering subject in `decision` /
`next_action`. A row already at `decision` is never overwritten — a manual call
outranks the classifier. Telegram webhook authenticates itself.
Three GET-only endpoints self-authenticate with a scoped ops token derived from AUTH_SECRET
(`src/lib/opsToken.ts`, `?key=` — for callers that cannot send headers: Claude web_fetch, pg_net):
`/api/assistant/nudges/external`, `/api/admin/capture-audit`, `/api/cron/reminders`; each
fail-closes, and personal-space content is redacted/excluded from the audit view.
Finance debt data additionally sits behind `FINANCE_PIN` (`/api/finance/unlock`,
`src/lib/financeLock.ts`) — locked responses omit debts/cards/net worth (see
`LockedFinanceOverviewDTO` in `src/lib/types.ts`).

## `src/lib` — where logic lives (grep here first)

- **Data/core**: `db.ts` (Supabase server client + query helpers), `types.ts` (all DTOs),
  `validate.ts`, `api.ts` (client fetch hooks), `crypto.ts`, `rateLimit.ts`, `userId.ts`,
  `localDate.ts`/`format.ts`/`paths.ts` (utils).
- **AI core**: `ai.ts` — the ONLY module allowed to import an LLM SDK (two-ring guardrail in
  `tests/unit/llmGuardrail.test.ts`). Clients with explicit timeouts/retries, `lightModel()`
  (`ANTHROPIC_MODEL`, frequent/cheap) vs `heavyModel()` (`ANTHROPIC_MODEL_HEAVY`, explicit paid
  actions), `textFrom()` (joins text blocks, skips thinking), `extractJson()` (tolerant of fences/
  prose/truncation). Heavy jobs (`advisor.ts`, `tailor.ts`) run with extended thinking enabled.
- **Finance**: `plaid.ts`, `financeSync.ts` (merge-don't-clobber account sync; cursor-based
  /transactions/sync with per-item cursors stored as `entities` kind `plaid_cursor`; per-item fault
  isolation stamps `plaid_items.status`, surfaced as a Reconnect banner via update-mode Link in
  `/api/plaid/link-token` with `item_id`), `financeOverview.ts`, `spending.ts`, `financeLock.ts`.
- **School**: `canvas.ts` (Canvas LMS sync), `courses.ts` (course entities; metadata carries the
  seeded semester schedule shown by SchoolBoard's ScheduleSection), `applications.ts` (+ `docx.ts`
  export; `realism` reach/target tag), `resume.ts`, `tailor.ts` (AI CV tailoring — hard-bans GPA/
  academic-standing on output), `academicContext.ts` (ADVISOR-ONLY private academic record from
  `profile.academic_context_private`; consumed solely by `nudges.ts` for realism, never rendered,
  see `tests/unit/academicPrivacy.test.ts`).
- **Planning**: `tasks.ts` (undated captures use a visible `inbox` urgency; dated tasks retain
  `due_date` + local `due_time` and appear on Calendar), `goals.ts`, `plans.ts`
  (plans/tracks/milestones), `calendar.ts`
  (own events + ICS overlays: legacy `GOOGLE_CALENDAR_ICAL_URL` env feed plus stored multi-provider
  feeds via `calendarFeeds.ts` — Google/Microsoft/any secret ICS URL, encrypted at rest like Plaid
  tokens, DTO never carries the URL, per-feed 5-min cache + fault isolation with `last_error`,
  each feed its own toggleable category; managed in the Me tab `CalendarFeedsSection`, CRUD at
  `/api/calendar/feeds`, table `calendar_feeds` in migration 0012), `nudges.ts` (assistant prompt keeps advice short and
  focused + hard-refuses medical/dosing advice), `briefing.ts` (folds in today's neutral rhythm lines), `advisor.ts`
  (money Q&A on the Finance tab).
- **Knowledge base**: `knowledgeBase.ts` is the assistant's
  personal KB (`knowledge_base` table, edited in the Me tab). Two TIERS gate privacy —
  `publicKnowledgeContext()` (public items) feeds the nudge engine (Home-facing), while
  `fullKnowledgeContext()` (public + private, private demarcated with rules) feeds only the
  private-reasoning consumers, `advisor.ts` and `/api/ask`. 'private' items are advisor-only: never
  Home/résumé/public-nudges/exports. Enforced by `tests/unit/knowledgeBasePrivacy.test.ts`;
  `backup.ts` strips the private tier from every snapshot. résumé/tailor/docx/memory never read it.
- **Rhythm & practice**: `rhythm.ts` (editable daily routine; `KINDS` now includes class/work/training alongside anchor/focus/akrov/meal/practice/wind-down/review — pure
  `orderBlocks`/`blocksForWeekday`, `DEFAULT_RHYTHM`, `rhythmBriefingLines`; neutral labels only), `dayView.ts` (client-safe: merges rhythm blocks + `workSchedule` shifts into a
  per-weekday timeline with derived end times, now/next, and day totals — feeds RhythmWeek), `rhythmPings.ts` (Telegram block nudges before focus/commute/review blocks + ✅/½/❌
  check-ins after focus blocks, table `rhythm_pings` (0013), run on the 5-min `/api/cron/reminders` tick; taps land via the
  webhook's `rc:` callbacks; `/api/rhythm/checkins` feeds the weekly tally; `now` Telegram command), `meditation.ts` (timer log + gentle streak), `reading.ts` (want/reading/
  finished list + per-book progress). Shared `consecutiveDayStreak`/`prevDayKey` live in
  `localDate.ts`.
- **Mind**: `capture.ts` (multi-item runCapture + single-item confirmation/reroute; compensating
  cleanup on partial failure; routes task/event/journal/note/personal plus plan/reading/application,
  matches school tasks to existing course entities, and persists task/event dates + times) +
  `router/classifyCapture.ts` (Claude → OpenAI → regex structured extraction: up to five items with
  route, confidence, clean title, date/time, domain/entity metadata; model output is reconciled with
  source-grounded `parseWhen` so explicit dates/times cannot be silently dropped), `memory.ts`
  (Supermemory), `journal.ts`, `summary.ts`, `dayLog.ts`
  (habits/intention), `profile.ts`, `transcribe.ts` (Whisper; feeds Telegram voice notes and web
  mic capture at `/api/capture/voice`), `telegram.ts` (bot I/O incl. sendDocument, inline
  keyboards, callback answers), `telegramCommands.ts` (strict command matcher —
  "cv"/"briefing"/"tasks"/"events"/"spending"/"backup", each with optional "pdf"/"docx" format
  suffix, reply with documents/summaries instead of being captured; Telegram gets locked-tier
  finance data and a sanitized export only), `pdf.ts` (plain text → A4 PDF, mirrors docx.ts
  heuristics), `backup.ts`.
- **Body**: `fitness.ts` (workout list + ingest upsert).

- **Config**: `config/nav.ts` (tabs), `config/habits.ts`, `config/profile.ts`.

## UI system

Two themes — **night** (deep-indigo paper, default) and **day** (ivory watercolor paper) — from one
token set in `src/app/globals.css` `@theme` (`ink-0…4` ramp, `ember` rose accent, `sage` periwinkle,
`sun/sky/iris` wash hues, `ok/warn/danger`); day values override under `:root[data-theme="day"]`,
`--color-white` flips ivory↔ink so all hairlines/washes invert. Theme resolved pre-paint by an
inline script in `layout.tsx` (localStorage `pos-theme`, falls back to OS preference); toggled by
`src/components/ThemeToggle.tsx` (TopRail + login). Atmosphere = `.aurora` + `.grain` layers painted by
`src/components/Shell.tsx`; page-entrance animation targets `main > *`; all motion respects
`prefers-reduced-motion`. Motion system in `src/lib/reveal.ts` (`useReveal` staggered scroll
reveals on every Panel, `useInView` for self-painting components, `useParallax` for ghost
watermarks) plus word-by-word headline entrances (`RisingWords` in `PageHeader`). Primitives in
`src/components/ui/` (`Panel` glass card, `Ring`, `ProgressBar`, `Tag`, `EmptyState`, `ErrorNote`,
`CountUp` roll-up numbers, `Marquee` editorial ticker). Chrome: `TopRail` (nav), `CaptureBar` (global quick-capture),
`CommandPalette` (⌘K). Data visuals stay single-hue teal (sequential ramps by opacity), text in ink
tokens.

## Background jobs & integrations

`vercel.json` crons hit `/api/cron/daily` (briefing, nudges, Canvas+Plaid sync, backup — see
`CRON_PATHS` in middleware; returns 500 when any step fails so the cron dashboard shows red).
**Timed reminders**: Supabase pg_cron (see `supabase/OPS_pg_cron_reminders.sql`) GETs
`/api/cron/reminders` every 5 min → `src/lib/reminders.ts` pings Telegram for open tasks due
today whose `due_time` is ≤5 min away (45-min catch-up window), idempotent via
`tasks.reminded_at` (migration 0011) — so "remind me at 5pm" actually pings at 5pm.
Telegram bot (`/api/telegram/webhook`) supports capture (text + voice), commands with document
replies, inline "move" buttons (callback_query → rerouteCapture), confidence-based confirmation,
and update-id claiming in `telegram_updates` so webhook retries cannot duplicate work.
Plaid link/exchange/sync under `/api/plaid/*`. All AI calls go through `src/lib/ai.ts` (models from
`ANTHROPIC_MODEL`/`ANTHROPIC_MODEL_HEAVY`) with OpenAI used for transcription + classifier fallback.
**External check-in path** (`/api/assistant/nudges/external`): a scheduled Claude session on the Max
subscription GETs the nudge context + contract (public tier — never the private academic block,
which must not enter a rendered transcript), generates the nudges off-API, and PUTs them back;
the daily cron then skips its paid regeneration when the set is <20h old (`nudgesFreshWithinHours`),
so the API path is only the automatic fallback.

## Persistence & ops

Schema: `supabase/migrations/*` (applied with `scripts/apply-migration.mjs`, or pasted into the SQL
Editor); newest are `0009_knowledge_base.sql` (tiered assistant KB) and
`0010_capture_engine_v3.sql` (task inbox/due times, multi-artifact capture rows, confidence state,
Telegram idempotency). Personal SEED data (profile, Akrov project, default rhythm, KB content) is applied separately
and deliberately kept out of the repo; `supabase/seed/demo.sql` provides a fictional dataset instead. Backups via
`/api/admin/backup` + `BackupSection`; `buildSnapshot` redacts advisor-only private data at source
(private profile columns + `knowledge_base` private-tier rows) so no export/bucket carries it. Env: `.env.local` (every name is listed in `.env.example`; secrets never in
repo). Tests: `tests/unit` (vitest, `npm run test:unit`), `tests/` e2e (Playwright,
`npm run test:e2e`). Build/lint: `npm run build`, `npm run lint`.

Keep this file updated when adding a tab, lib module, or integration — it's the cheap map that
saves every future session a full-repo crawl.

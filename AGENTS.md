<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Start here

Read `ARCHITECTURE.md` before exploring the codebase — it maps the stack, routes, lib modules,
auth model, and UI system in one page, and is cheaper than a repo crawl. Keep it updated when the
structure changes.

`README.md` covers how to run and test the project, plus the test-enforced privacy
guardrails you must not break.

# Where things go

- Logic in `src/lib/`, not in route handlers or components.
- New tab: page under `src/app/(dashboard)/`, Board in `src/components/dashboard/`, entry in
  `src/lib/config/nav.ts` — then update `ARCHITECTURE.md`.
- Visual source material → `design/`.
- Nothing loose in the project root. It holds config, `README.md`, `ARCHITECTURE.md`,
  `AGENTS.md`, `CLAUDE.md` — nothing else.
- Secrets stay in `.env.local` (names documented in `.env.example`); personal seed data stays
  out of the repo.

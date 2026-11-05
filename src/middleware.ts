import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  secretsMatch,
  verifyApiSecret,
  verifySessionToken,
} from "@/lib/auth/session";

/** Routes the cron bearer may unlock — never the whole app. */
const CRON_PATHS = new Set([
  "/api/cron/daily",
  "/api/plaid/sync",
  "/api/assistant/nudges",
  "/api/admin/backup",
  "/api/briefing",
]);

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` on scheduled runs. */
async function isVercelCron(request: NextRequest): Promise<boolean> {
  if (!CRON_PATHS.has(request.nextUrl.pathname)) return false;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && (await secretsMatch(auth, `Bearer ${secret}`));
}

/**
 * The external lifting app pushes workouts with
 * `Authorization: Bearer <FITNESS_INGEST_SECRET>` — only POST, only this path.
 * The route re-checks the bearer to pick ingest (upsert) vs manual mode.
 */
async function isFitnessIngest(request: NextRequest): Promise<boolean> {
  if (request.method !== "POST" || request.nextUrl.pathname !== "/api/fitness/workouts") {
    return false;
  }
  const secret = process.env.FITNESS_INGEST_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && (await secretsMatch(auth, `Bearer ${secret}`));
}

/**
 * The Akrov Gmail forwarder pushes email items with
 * `Authorization: Bearer <AKROV_INGEST_SECRET>` — only POST, only this path.
 * The route re-checks the bearer itself.
 */
async function isAkrovIngest(request: NextRequest): Promise<boolean> {
  if (request.method !== "POST" || request.nextUrl.pathname !== "/api/akrov/ingest") {
    return false;
  }
  const secret = process.env.AKROV_INGEST_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && (await secretsMatch(auth, `Bearer ${secret}`));
}

/**
 * The job-search Gmail forwarder pushes email items with
 * `Authorization: Bearer <JOBS_INGEST_SECRET>` — only POST, only this path.
 * The route re-checks the bearer itself.
 */
async function isJobsIngest(request: NextRequest): Promise<boolean> {
  if (request.method !== "POST" || request.nextUrl.pathname !== "/api/jobs/ingest") {
    return false;
  }
  const secret = process.env.JOBS_INGEST_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return !!auth && (await secretsMatch(auth, `Bearer ${secret}`));
}

/**
 * Paths reachable without a session:
 *   /login        the password screen
 *   /api/auth/*   login / logout endpoints
 *   /api/telegram/*  (and future webhooks) — these authenticate themselves,
 *                    typically via the x-api-secret header below.
 */
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/telegram"];

/**
 * GET-only endpoints that authenticate THEMSELVES with the scoped ops token
 * (`?key=` — src/lib/opsToken.ts) or a cron bearer, because their callers
 * (Claude's web_fetch, Supabase pg_net) cannot send the x-api-secret header.
 * Each route fail-closes with 401 on a missing/bad key; middleware only steps
 * aside for the exact path + method.
 */
const SELF_AUTHED_GETS = new Set([
  "/api/assistant/nudges/external",
  "/api/admin/capture-audit",
  "/api/cron/reminders",
  // /ops/* mirrors of the same handlers — web_fetch-class callers refuse
  // URLs containing "/api/", so the ops endpoints answer here too.
  "/ops/checkin",
  "/ops/capture-audit",
  "/ops/reminders",
]);

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Self-authenticating GETs (ops-token or cron-bearer checked in the route).
  if (request.method === "GET" && SELF_AUTHED_GETS.has(pathname)) {
    return NextResponse.next();
  }

  // Programmatic access: shared-secret header for cron jobs and webhooks.
  if (await verifyApiSecret(request.headers.get("x-api-secret"))) {
    return NextResponse.next();
  }

  // Vercel Cron (e.g. the daily /api/plaid/sync) authenticates via its Bearer token.
  if (await isVercelCron(request)) {
    return NextResponse.next();
  }

  // Workout ingest from the external lifting app (H4).
  if (await isFitnessIngest(request)) {
    return NextResponse.next();
  }

  // Email-item ingest from the Akrov Gmail forwarder.
  if (await isAkrovIngest(request)) {
    return NextResponse.next();
  }

  // Email-item ingest from the job-search Gmail forwarder.
  if (await isJobsIngest(request)) {
    return NextResponse.next();
  }

  // Interactive access: HMAC-signed session cookie.
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  // Unauthenticated: APIs get a 401; pages bounce to /login with a return path.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on all routes except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

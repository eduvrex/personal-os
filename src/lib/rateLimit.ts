import "server-only";

/**
 * Fixed-window in-memory rate limiter for the expensive (LLM-calling) routes.
 *
 * Serverless caveat: state is per warm instance, so this is burst protection,
 * not a distributed quota — which is exactly the failure mode that matters here
 * (a stuck client or a script hammering one instance into a large AI bill).
 * Single-user app, so keys are per-route, not per-caller.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (w.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  w.count++;
  return { ok: true, retryAfterSec: 0 };
}

/** 429 response body + headers helper values. */
export function tooMany(retryAfterSec: number): {
  body: { error: string };
  init: ResponseInit;
} {
  return {
    body: { error: "Too many requests — try again shortly." },
    init: { status: 429, headers: { "retry-after": String(retryAfterSec) } },
  };
}

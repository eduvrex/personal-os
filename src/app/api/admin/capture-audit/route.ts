import { type NextRequest } from "next/server";

import { rerouteCapture } from "@/lib/capture";
import { db, USER_ID } from "@/lib/db";
import { opsResponse, verifyOpsKey } from "@/lib/opsToken";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import type { CaptureRoute } from "@/lib/types";

export const maxDuration = 60;

/**
 * Read-mostly debugging window over the capture pipeline, for diagnosing
 * misroutes from a Claude session (which can only GET; auth via
 * `?key=<ops token>`, middleware lets the path through, route fail-closes).
 *
 * PRIVACY: personal-space content NEVER leaves. Captures routed to `personal`
 * have their text redacted; journal listing excludes personal/private rows
 * entirely. The one write op, `&reroute=<captureId>&to=<route>`, goes through
 * the same rerouteCapture used by the Telegram inline buttons (artifact
 * cleanup + memory hygiene included) — no raw table writes.
 */

const ROUTES: CaptureRoute[] = [
  "personal", "journal", "task", "event", "note", "plan", "reading", "application",
];

const short = (value: unknown, n = 160) =>
  String(value ?? "").replace(/\s+/g, " ").slice(0, n);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fmt = params.get("fmt");
  if (!verifyOpsKey(params.get("key"))) {
    return opsResponse({ error: "Unauthorized." }, fmt, 401);
  }
  const limit = rateLimit("capture-audit", 30, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return opsResponse(body, fmt, init.status ?? 429);
  }

  try {
    const rerouteId = params.get("reroute");
    const to = params.get("to");
    if (rerouteId) {
      const route = ROUTES.find((r) => r === to);
      if (!route) {
        return opsResponse({ error: "to must be a valid route." }, fmt, 400);
      }
      const outcome = await rerouteCapture(rerouteId, route);
      return opsResponse({ ok: true, rerouted: rerouteId, to: route, label: outcome.label }, fmt);
    }

    const [captures, artifacts, tasks, journal] = await Promise.all([
      db()
        .from("raw_captures")
        .select("id,created_at,source,raw_text,routed_to,routed_id,llm_source,confidence,status")
        .eq("user_id", USER_ID)
        .order("created_at", { ascending: false })
        .limit(40),
      db()
        .from("capture_artifacts")
        .select("capture_id,item_index,route,routed_id,extraction,created_at")
        .eq("user_id", USER_ID)
        .order("created_at", { ascending: false })
        .limit(60),
      db()
        .from("tasks")
        .select("id,title,domain,urgency,due_date,due_time,completed_at,reminded_at,created_at")
        .eq("user_id", USER_ID)
        .order("created_at", { ascending: false })
        .limit(25),
      db()
        .from("journal_entries")
        .select("id,created_at,source,text")
        .eq("user_id", USER_ID)
        .neq("personal", true)
        .neq("private", true)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    for (const r of [captures, artifacts, tasks, journal]) {
      if (r.error) throw new Error(r.error.message);
    }

    return opsResponse({
      captures: (captures.data ?? []).map((c) => ({
        ...c,
        raw_text: c.routed_to === "personal" ? "[personal — redacted]" : short(c.raw_text),
      })),
      artifacts: (artifacts.data ?? []).map((a) => {
        const x = (a.extraction ?? {}) as Record<string, unknown>;
        return {
          capture_id: a.capture_id,
          item_index: a.item_index,
          route: a.route,
          routed_id: a.routed_id,
          title: a.route === "personal" ? "[redacted]" : short(x.title, 80),
          date: x.date ?? null,
          time: x.time ?? null,
          confidence: x.confidence ?? null,
        };
      }),
      tasks: (tasks.data ?? []).map((t) => ({ ...t, title: short(t.title, 100) })),
      journal: (journal.data ?? []).map((j) => ({
        id: j.id,
        created_at: j.created_at,
        source: j.source,
        text: short(j.text, 140),
      })),
    }, fmt);
  } catch (e) {
    return opsResponse(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      fmt,
      500,
    );
  }
}

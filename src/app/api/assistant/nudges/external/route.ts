import { NextResponse, type NextRequest } from "next/server";

import {
  buildNudgeContext,
  NUDGE_SYSTEM_PROMPT,
  type RawNudge,
  saveNudges,
} from "@/lib/nudges";
import { opsResponse, verifyOpsKey } from "@/lib/opsToken";
import { listPlans } from "@/lib/plans";
import { rateLimit, tooMany } from "@/lib/rateLimit";
import { asObject, ValidationError } from "@/lib/validate";
import type { PlanDTO } from "@/lib/types";

export const maxDuration = 60;

/**
 * The external (subscription-billed) nudge path. A scheduled Claude session —
 * running on Eduardo's Max plan, not the metered API — fetches the grounding
 * context + generation contract here, generates the nudges itself, submits
 * them back, and the daily Vercel cron then skips its paid regeneration
 * (see `nudgesFreshWithinHours` in the cron route).
 *
 * TRANSPORT: Claude's sandbox can only issue plain GETs (no custom headers),
 * so GET self-authenticates with `?key=<ops token>` (middleware lets it
 * through; see src/lib/opsToken.ts for the derivation + threat model) and a
 * submit is a GET with `&submit=<base64url {"nudges":[...],"model":"..."}>` —
 * the same GET-with-side-effect precedent the Vercel-cron nudge route already
 * uses. PUT (x-api-secret via middleware) remains for ordinary clients.
 *
 * PRIVACY: context is built with `includePrivateAcademic: false`. The private
 * academic record is advisor-only and never rendered; an external chat
 * transcript renders on screen, so it must not travel there. The paid
 * in-process fallback still uses the full context.
 */

/** Parse and bound one submitted nudge; throws ValidationError on junk. */
function parseNudge(value: unknown, index: number): RawNudge {
  const obj = asObject(value);
  const text = typeof obj.text === "string" ? obj.text.trim() : "";
  if (!text) throw new ValidationError(`nudges[${index}].text is required.`);
  if (text.length > 500) throw new ValidationError(`nudges[${index}].text is too long.`);
  const plan =
    typeof obj.plan === "string" && obj.plan.trim() ? obj.plan.trim().slice(0, 160) : undefined;
  const priority =
    typeof obj.priority === "number" && Number.isFinite(obj.priority)
      ? Math.min(9, Math.max(1, Math.round(obj.priority)))
      : undefined;
  return { text, ...(plan ? { plan } : {}), ...(priority ? { priority } : {}) };
}

function parseSubmission(body: Record<string, unknown>): { nudges: RawNudge[]; model: string } {
  if (!Array.isArray(body.nudges) || body.nudges.length === 0) {
    throw new ValidationError("nudges must be a non-empty array.");
  }
  if (body.nudges.length > 6) throw new ValidationError("At most 6 nudges.");
  const nudges = body.nudges.map(parseNudge);
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 80)
      : "claude-subscription";
  return { nudges, model };
}

async function store(nudges: RawNudge[], model: string) {
  const plans = (await listPlans()) as PlanDTO[];
  return saveNudges(nudges, {
    plans,
    sourceCounts: { external: true, nudges_received: nudges.length },
    model,
  });
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fmt = params.get("fmt");
  if (!verifyOpsKey(params.get("key"))) {
    return opsResponse({ error: "Unauthorized." }, fmt, 401);
  }
  const limit = rateLimit("nudges-external", 10, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return opsResponse(body, fmt, init.status ?? 429);
  }

  const submit = params.get("submit");
  if (submit) {
    if (submit.length > 12_000) {
      return opsResponse({ error: "Submission too large." }, fmt, 400);
    }
    try {
      const parsed = parseSubmission(asObject(JSON.parse(decodeBase64Url(submit))));
      const result = await store(parsed.nudges, parsed.model);
      return opsResponse({ ok: true, ...result }, fmt);
    } catch (e) {
      const invalid = e instanceof ValidationError || e instanceof SyntaxError;
      return opsResponse(
        { error: e instanceof Error ? e.message : "Invalid submission." },
        fmt,
        invalid ? 400 : 500,
      );
    }
  }

  try {
    const { context, sourceCounts } = await buildNudgeContext({
      includePrivateAcademic: false,
    });
    return opsResponse({
      contract: NUDGE_SYSTEM_PROMPT,
      context,
      source_counts: sourceCounts,
    }, fmt);
  } catch (e) {
    return opsResponse(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      fmt,
      500,
    );
  }
}

export async function PUT(request: NextRequest) {
  const limit = rateLimit("nudges-external", 10, 5 * 60_000);
  if (!limit.ok) {
    const { body, init } = tooMany(limit.retryAfterSec);
    return NextResponse.json(body, init);
  }

  let parsed: { nudges: RawNudge[]; model: string };
  try {
    parsed = parseSubmission(asObject(await request.json().catch(() => null)));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof ValidationError ? e.message : "Invalid body." },
      { status: 400 },
    );
  }

  try {
    const result = await store(parsed.nudges, parsed.model);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 },
    );
  }
}

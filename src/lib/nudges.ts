import "server-only";

import { anthropicClient, extractJson, lightModel, textFrom } from "@/lib/ai";
import { db, USER_ID } from "@/lib/db";
import { ACADEMIC_CONTEXT_RULES, getPrivateAcademicContext } from "@/lib/academicContext";
import { publicKnowledgeContext } from "@/lib/knowledgeBase";
import { getProfile } from "@/lib/profile";
import { getResume } from "@/lib/resume";
import { listPlans, currentSavings } from "@/lib/plans";
import { listApplications } from "@/lib/applications";
import { buildFinanceOverview } from "@/lib/financeOverview";
import { queryTasks } from "@/lib/tasks";
import { localDateKey } from "@/lib/localDate";
import type { NudgeDTO, PlanDTO } from "@/lib/types";

/**
 * Exported as the generation CONTRACT for the external (subscription-billed)
 * check-in path: a Claude session fetches context + this prompt, generates
 * nudges on the Max plan, and PUTs them back — same rules, no API spend.
 */
export const NUDGE_SYSTEM_PROMPT =
  "You are Eduardo's personal assistant inside his Personal OS. Using ONLY the data provided, suggest the 3-5 most useful, specific next actions toward his goals — especially his main active plan. Ground every suggestion in his actual data and name the relevant plan or track. CRITICAL — NUMBERS: only ever cite a dollar amount, count, percentage, or timeframe that appears verbatim in the DATA block below; quote those exact figures (net worth, card debt, savings, deadlines) and NEVER estimate, round up, extrapolate, or invent a number — no made-up salaries, income, totals, card counts, or months-to-payoff. If a figure is not in the data, describe the situation without inventing one. Balance across the Academic, Career, and Finance tracks (do not put them all on one). Call out application deadlines that are approaching (e.g. 'Program X closes in ~3 weeks — draft your statement of purpose'). If something is blocking a goal (e.g. high-interest card debt vs. a savings target), point it out factually. You are not a financial advisor — present facts and options, never directives. Keep guidance focused: short and specific, surface ONE clear top priority rather than a pile, reduce overwhelm, and prefer scheduling the most demanding cognitive work in the morning. You NEVER give medical, health, dosing, mental-health, or clinical advice of any kind — if such topics arise, defer to qualified professionals. If a PRIVATE ACADEMIC CONTEXT block is provided, obey its rules exactly: use it to calibrate realism (never inflate admissions odds) but never quote its specifics — no grades or other record details in suggestion text. Be concrete, not generic. Return ONLY a JSON array of objects {\"text\": string, \"plan\": string, \"priority\": number} where priority 1 is highest. No prose outside the JSON.";

function daysUntil(dateKey: string | null): number | null {
  if (!dateKey) return null;
  return Math.round((Date.parse(`${dateKey}T00:00:00`) - Date.now()) / 86_400_000);
}

/**
 * Privacy filter for nudge inputs: drop captures routed to the personal space
 * and captures whose routed journal entry is private/personal. Pure; exported
 * for the privacy-invariant test.
 */
export function filterNudgeCaptures<
  T extends { routed_to?: string | null; routed_id?: string | null },
>(rows: T[], privateJournalIds: Set<string>): T[] {
  return rows.filter(
    (c) =>
      c.routed_to !== "personal" &&
      !(c.routed_id && privateJournalIds.has(String(c.routed_id))),
  );
}

/**
 * Gather everything the assistant is allowed to see (never the personal space).
 *
 * `includePrivateAcademic` (default true) appends the advisor-only academic
 * block for the in-process API path. The external check-in endpoint passes
 * FALSE: its context travels into a chat transcript that renders on screen,
 * and the private academic record is never rendered anywhere.
 */
export async function buildNudgeContext({ includePrivateAcademic = true } = {}) {
  const [profile, academicContext, knowledge, resume, plans, apps, finance, savings, today, week, captures] =
    await Promise.all([
      getProfile(),
      includePrivateAcademic ? getPrivateAcademicContext() : Promise.resolve(null),
      // PUBLIC tier only — nudge output renders on Home, so private knowledge
      // never enters this prompt.
      publicKnowledgeContext(),
      getResume(),
      listPlans(),
      listApplications(),
      buildFinanceOverview(),
      currentSavings(),
      queryTasks({ urgency: "today", status: "open" }),
      queryTasks({ urgency: "week", status: "open" }),
      db()
        .from("raw_captures")
        .select("raw_text,routed_to,routed_id,created_at")
        .eq("user_id", USER_ID)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  // Never feed private (personal-space or private-marked) content to the nudge
  // engine. Exclude captures routed to the personal space and any capture whose
  // routed journal entry is private/personal.
  const priv = await db()
    .from("journal_entries")
    .select("id")
    .eq("user_id", USER_ID)
    .or("private.eq.true,personal.eq.true");
  const privateIds = new Set((priv.data ?? []).map((r) => String(r.id)));
  const captureRows = filterNudgeCaptures(captures.data ?? [], privateIds).slice(0, 5);

  const planLines = (plans as PlanDTO[]).flatMap((p) => {
    const head = `- Plan: ${p.title}${p.target_date ? ` (target ${p.target_date}, ${daysUntil(p.target_date)}d)` : ""}${p.savings_target ? ` savings target $${p.savings_target} vs current $${Math.round(savings)}` : ""} — ${p.progress}%`;
    const tracks = (p.tracks ?? []).map((t) => {
      const open = t.milestones.filter((m) => !m.done).map((m) => m.label);
      return `   • Track ${t.title} (${t.progress}%) open: ${open.join("; ") || "none"}`;
    });
    return [head, ...tracks];
  });

  const appLines = apps
    .map((a) => {
      const d = daysUntil(a.deadline);
      const due = a.deadline ? `${a.deadline} (${d}d)` : a.deadline_indicative ?? "rolling";
      return `- ${a.org} — ${a.title} [${a.status}] deadline ${due}${a.test_required && a.test_required !== "none" ? ` test:${a.test_required}` : ""}`;
    })
    .slice(0, 14);

  const overLimit = finance.cards.filter((c) => c.overLimit).map((c) => c.name);
  const dueSoon = finance.cards.filter((c) => c.dueSoon).map((c) => c.name);
  const cardCount = finance.cards.filter((c) => (c.balance ?? 0) > 0).length;

  const financeLine = `Net worth $${Math.round(finance.netWorth)}; card debt $${Math.round(finance.cardDebt)} across ${cardCount} card(s); savings $${Math.round(savings)}; over-limit: ${overLimit.join(", ") || "none"}; due-soon: ${dueSoon.join(", ") || "none"}. Monthly income/salary is NOT tracked in this app — never state an income figure.`;

  const context = [
    `Today: ${localDateKey()}.`,
    `Profile: ${profile.occupation ?? ""}; ${profile.current_city ?? ""} -> ${profile.target_city ?? ""} by ${profile.target_date ?? "?"}; residency: ${profile.residency_status ?? ""}.`,
    `About: ${profile.about ?? ""}`,
    ...(knowledge ? ["", knowledge] : []),
    resume.full_text ? `CV: ${resume.full_text.slice(0, 1200)}` : "",
    "",
    "Plans & tracks:",
    ...planLines,
    "",
    "Applications:",
    ...appLines,
    "",
    `Finance: ${financeLine}`,
    "",
    `Open tasks today: ${today.map((t) => t.title).join("; ") || "none"}`,
    `Open tasks this week: ${week.map((t) => t.title).join("; ") || "none"}`,
    `Recent captures: ${captureRows.map((c) => c.raw_text).filter(Boolean).join(" | ") || "none"}`,
    // Advisor-only realism input — rules first, then the context. Never
    // rendered anywhere; the system prompt forbids quoting its specifics.
    ...(academicContext
      ? ["", ACADEMIC_CONTEXT_RULES, `PRIVATE ACADEMIC CONTEXT:\n${academicContext}`]
      : []),
  ].join("\n");

  const sourceCounts = {
    plans: plans.length,
    applications: apps.length,
    open_tasks: today.length + week.length,
    captures: captureRows.length,
    net_worth: Math.round(finance.netWorth),
  };

  return { context, plans: plans as PlanDTO[], sourceCounts };
}

export interface RawNudge {
  text: string;
  plan?: string;
  priority?: number;
}

/**
 * Link a model-returned plan/track name to a stored plan id. Exact title
 * matches win at any length; substring matches require the contained string to
 * be at least 6 characters so short titles ("EU", "Move") don't mislink. Pure;
 * exported for tests.
 */
export function matchPlanId(
  name: string | null | undefined,
  nameToId: Map<string, string>,
): string | null {
  if (!name) return null;
  const low = name.trim().toLowerCase();
  const exact = nameToId.get(low);
  if (exact) return exact;
  for (const [title, id] of nameToId) {
    if (title.length >= 6 && low.includes(title)) return id;
    if (low.length >= 6 && title.includes(low)) return id;
  }
  return null;
}

/**
 * Persist a generated nudge set. Build-then-swap: remember the old rows,
 * insert the new set, then delete only the old ids — a failed insert leaves
 * the previous nudges intact instead of an empty table. Shared by the API
 * path (`generateNudges`) and the external subscription-billed path
 * (`/api/assistant/nudges/external`).
 */
export async function saveNudges(
  parsed: RawNudge[],
  { plans, sourceCounts, model }: {
    plans: PlanDTO[];
    sourceCounts: Record<string, unknown>;
    model: string;
  },
): Promise<{ count: number }> {
  // Map plan/track names to ids for linking.
  const nameToId = new Map<string, string>();
  for (const p of plans) {
    nameToId.set(p.title.toLowerCase(), p.id);
    for (const t of p.tracks ?? []) nameToId.set(t.title.toLowerCase(), t.id);
  }

  const now = new Date().toISOString();
  const source = { generated_at: now, model, inputs: sourceCounts };
  const rows = parsed.slice(0, 6).map((n, i) => ({
    user_id: USER_ID,
    text: String(n.text ?? "").trim().slice(0, 500),
    plan: typeof n.plan === "string" ? n.plan : null,
    plan_id: matchPlanId(typeof n.plan === "string" ? n.plan : null, nameToId),
    priority: typeof n.priority === "number" ? n.priority : i + 1,
    created_at: now,
    dismissed: false,
  })).filter((r) => r.text.length > 0);
  if (rows.length === 0) throw new Error("No usable nudges to save.");

  const existing = await db().from("nudges").select("id").eq("user_id", USER_ID);
  if (existing.error) throw new Error(existing.error.message);
  const oldIds = (existing.data ?? []).map((r) => String(r.id));

  const { error } = await db().from("nudges").insert(
    rows.map((r) => ({
      user_id: r.user_id,
      text: r.text,
      plan_id: r.plan_id,
      priority: r.priority,
      source: { ...source, plan: r.plan },
      created_at: r.created_at,
      dismissed: false,
    })),
  );
  if (error) throw new Error(error.message);

  if (oldIds.length > 0) {
    const { error: swapError } = await db()
      .from("nudges")
      .delete()
      .eq("user_id", USER_ID)
      .in("id", oldIds);
    if (swapError) throw new Error(swapError.message);
  }
  return { count: rows.length };
}

/**
 * True when the current nudge set was generated within the last `hours`.
 * The daily cron uses this to SKIP its paid regeneration when the external
 * (subscription-billed) check-in already refreshed the set this morning.
 */
export async function nudgesFreshWithinHours(hours: number): Promise<boolean> {
  const { data, error } = await db()
    .from("nudges")
    .select("source")
    .eq("user_id", USER_ID)
    .eq("dismissed", false)
    .limit(1);
  if (error || !data?.length) return false;
  const generatedAt = (data[0].source as { generated_at?: string })?.generated_at;
  if (!generatedAt) return false;
  const age = Date.now() - Date.parse(generatedAt);
  return Number.isFinite(age) && age >= 0 && age < hours * 3_600_000;
}

/**
 * Regenerate nudges via the Anthropic API (light tier). Replaces the stored
 * set only on success — on any API/parse error the previous nudges are left
 * intact (graceful fallback).
 */
export async function generateNudges(): Promise<{ count: number }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Nudges need ANTHROPIC_API_KEY.");

  const { context, plans, sourceCounts } = await buildNudgeContext();

  const client = anthropicClient({ timeoutMs: 60_000 });
  const res = await client.messages.create({
    model: lightModel(),
    max_tokens: 1200,
    system: NUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: context }],
  });

  const json = extractJson(textFrom(res));
  const parsed: RawNudge[] = Array.isArray(json) ? (json as RawNudge[]) : [];
  if (parsed.length === 0) throw new Error("Could not parse assistant response.");

  return saveNudges(parsed, { plans, sourceCounts, model: lightModel() });
}

export async function listNudges(): Promise<NudgeDTO[]> {
  const { data, error } = await db()
    .from("nudges")
    .select("id,text,plan_id,priority,source")
    .eq("user_id", USER_ID)
    .eq("dismissed", false)
    .order("priority", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    text: String(r.text),
    plan: ((r.source as { plan?: string })?.plan as string) ?? null,
    plan_id: (r.plan_id as string) ?? null,
    priority: Number(r.priority ?? 0),
  }));
}

export async function dismissNudge(id: string): Promise<void> {
  const { error } = await db()
    .from("nudges")
    .update({ dismissed: true })
    .eq("user_id", USER_ID)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

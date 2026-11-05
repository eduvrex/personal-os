import "server-only";

import { db, USER_ID } from "@/lib/db";

/**
 * ADVISOR-ONLY academic context.
 *
 * Lives in profile.academic_context_private, which is deliberately:
 *   - absent from ProfileDTO (profile.ts maps known fields only), so it can
 *     never render on Home, the Me tab, or any board;
 *   - not editable via /api/profile (profile.ts FIELDS excludes it);
 *   - never imported by resume / tailor / briefing / summary / telegram /
 *     memory / export paths — enforced structurally by
 *     tests/unit/academicPrivacy.test.ts.
 *
 * Sole consumer: the Next-Steps assistant (nudges.ts), which uses it to keep
 * guidance realistic — never to restate the record on screen.
 */
export async function getPrivateAcademicContext(): Promise<string | null> {
  const { data, error } = await db()
    .from("profile")
    .select("academic_context_private")
    .eq("user_id", USER_ID)
    .maybeSingle();
  // Advisory input only — a missing column or row must never break nudges.
  if (error) return null;
  const text = (data?.academic_context_private as string | null) ?? null;
  return text?.trim() ? text : null;
}

/** Output rules that must accompany the private context in any prompt. */
export const ACADEMIC_CONTEXT_RULES = [
  "PRIVATE ACADEMIC CONTEXT rules:",
  "- Use it ONLY to keep guidance realistic (e.g. admissions odds). NEVER inflate admissions odds.",
  "- NEVER restate its specifics (grades or any other record detail) in suggestion text — suggestions render on the Home page.",
  "- NEVER suggest hiding or misrepresenting the record.",
].join("\n");

import "server-only";

import { db, USER_ID } from "@/lib/db";
import type { CanvasAssignmentDTO, CanvasCourseDTO } from "@/lib/types";

/**
 * W4 — Canvas LMS, READ-ONLY, via a personal access token.
 *
 * Env: CANVAS_BASE_URL (e.g. https://school.instructure.com) and
 * CANVAS_ACCESS_TOKEN. Both server-side only. When absent, everything here
 * degrades to "not configured" and the School tab runs on manual data.
 */

export function canvasConfigured(): boolean {
  return !!process.env.CANVAS_BASE_URL && !!process.env.CANVAS_ACCESS_TOKEN;
}

function baseUrl(): string {
  return (process.env.CANVAS_BASE_URL ?? "").replace(/\/+$/, "");
}

/** GET a Canvas API path, following Link-header pagination (rel="next"). */
async function canvasGetAll<T>(path: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  const search = new URLSearchParams({ per_page: "100", ...params });
  let url: string | null = `${baseUrl()}/api/v1${path}?${search}`;
  let hops = 0;
  while (url && hops < 20) {
    hops++;
    const res: Response = await fetch(url, {
      headers: { authorization: `Bearer ${process.env.CANVAS_ACCESS_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Canvas ${path} failed: ${res.status} ${(await res.text()).slice(0, 150)}`);
    }
    const page = (await res.json()) as T[];
    out.push(...(Array.isArray(page) ? page : []));
    url = parseNextLink(res.headers.get("link"));
  }
  // A truncated fetch must fail loudly — the sync prunes rows missing from the
  // result, so silently returning a partial set would delete live data.
  if (url) throw new Error(`Canvas ${path} pagination exceeded ${hops} pages.`);
  return out;
}

/** Extract the rel="next" URL from a Canvas Link header. Exported for tests. */
export function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

/**
 * Detect the assignment flavor for calendar mapping. Quizzes/exams/projects
 * land in "School — Exams / Projects"; the rest in "School — Assignments".
 * Exported for tests.
 */
export function detectKind(input: {
  name?: string | null;
  is_quiz_assignment?: boolean;
  submission_types?: string[] | null;
}): "assignment" | "quiz" | "exam" | "project" {
  const name = (input.name ?? "").toLowerCase();
  // "Final Project" is a project; a bare "final"/"midterm"/"exam" is an exam.
  if (/\bproject\b/.test(name)) return "project";
  if (/\b(exam|midterm|final)\b/.test(name)) return "exam";
  if (input.is_quiz_assignment || (input.submission_types ?? []).includes("online_quiz")) {
    return "quiz";
  }
  return "assignment";
}

interface RawCourse {
  id: number;
  name?: string;
  course_code?: string;
  term?: { name?: string };
  enrollments?: { computed_current_score?: number | null; computed_current_grade?: string | null }[];
}

interface RawAssignment {
  id: number;
  name?: string;
  due_at?: string | null;
  points_possible?: number | null;
  html_url?: string;
  is_quiz_assignment?: boolean;
  submission_types?: string[];
  submission?: {
    workflow_state?: string;
    submitted_at?: string | null;
    score?: number | null;
  } | null;
}

export interface CanvasSyncResult {
  configured: boolean;
  courses: number;
  assignments: number;
}

/** Pull courses + assignments + grades into the local mirror tables. */
export async function runCanvasSync(): Promise<CanvasSyncResult> {
  if (!canvasConfigured()) return { configured: false, courses: 0, assignments: 0 };
  const now = new Date().toISOString();

  const courses = await canvasGetAll<RawCourse>("/courses", {
    enrollment_state: "active",
    "include[]": "total_scores",
  });

  let courseCount = 0;
  let assignmentCount = 0;

  // Everything the fetches said still exists upstream, for pruning below.
  const keptCourseIds = courses.map((c) => c.id).filter(Boolean);
  const syncedCourseIds: number[] = [];
  const keptAssignmentIds: number[] = [];

  for (const c of courses) {
    if (!c.id || !c.name) continue;
    const enrollment = (c.enrollments ?? [])[0];
    const { error } = await db()
      .from("canvas_courses")
      .upsert(
        {
          user_id: USER_ID,
          canvas_id: c.id,
          name: c.name.slice(0, 300),
          course_code: c.course_code?.slice(0, 100) ?? null,
          term: c.term?.name?.slice(0, 100) ?? null,
          current_score: enrollment?.computed_current_score ?? null,
          current_grade: enrollment?.computed_current_grade ?? null,
          updated_at: now,
        },
        { onConflict: "user_id,canvas_id" },
      );
    if (error) throw new Error(`canvas_courses upsert: ${error.message}`);
    courseCount++;

    const assignments = await canvasGetAll<RawAssignment>(
      `/courses/${c.id}/assignments`,
      { "include[]": "submission" },
    );
    syncedCourseIds.push(c.id);
    keptAssignmentIds.push(...assignments.map((a) => a.id).filter(Boolean));
    for (const a of assignments) {
      if (!a.id || !a.name) continue;
      const state = a.submission?.workflow_state ?? "";
      const { error: aErr } = await db()
        .from("canvas_assignments")
        .upsert(
          {
            user_id: USER_ID,
            canvas_id: a.id,
            course_canvas_id: c.id,
            name: a.name.slice(0, 500),
            due_at: a.due_at ?? null,
            points_possible: a.points_possible ?? null,
            kind: detectKind(a),
            submitted: !!a.submission?.submitted_at || ["submitted", "graded", "pending_review"].includes(state),
            graded: state === "graded",
            score: a.submission?.score ?? null,
            html_url: a.html_url?.slice(0, 1000) ?? null,
            updated_at: now,
          },
          { onConflict: "user_id,canvas_id" },
        );
      if (aErr) throw new Error(`canvas_assignments upsert: ${aErr.message}`);
      assignmentCount++;
    }
  }

  // Prune local mirrors of rows removed upstream. This point is only reached
  // when every fetch above succeeded (canvasGetAll throws on failure or
  // truncation), so a failed or partial sync never deletes anything.
  const courseSet = `(${keptCourseIds.join(",")})`;
  {
    // Courses that disappeared upstream, and their assignments.
    let cq = db().from("canvas_courses").delete().eq("user_id", USER_ID);
    if (keptCourseIds.length > 0) cq = cq.not("canvas_id", "in", courseSet);
    const { error } = await cq;
    if (error) throw new Error(`canvas_courses prune: ${error.message}`);

    let aq = db().from("canvas_assignments").delete().eq("user_id", USER_ID);
    if (keptCourseIds.length > 0) aq = aq.not("course_canvas_id", "in", courseSet);
    const { error: aErr } = await aq;
    if (aErr) throw new Error(`canvas_assignments prune: ${aErr.message}`);
  }
  if (syncedCourseIds.length > 0) {
    // Assignments removed from a course we did sync this run — scoped to the
    // synced courses so other courses' rows are never touched.
    let q = db()
      .from("canvas_assignments")
      .delete()
      .eq("user_id", USER_ID)
      .in("course_canvas_id", syncedCourseIds);
    if (keptAssignmentIds.length > 0) {
      q = q.not("canvas_id", "in", `(${keptAssignmentIds.join(",")})`);
    }
    const { error } = await q;
    if (error) throw new Error(`canvas_assignments prune: ${error.message}`);
  }

  return { configured: true, courses: courseCount, assignments: assignmentCount };
}

/** Courses + assignments for the School tab. Resilient pre-migration. */
export async function getCanvasData(): Promise<{
  configured: boolean;
  courses: CanvasCourseDTO[];
}> {
  const configured = canvasConfigured();
  try {
    const [cRes, aRes] = await Promise.all([
      db().from("canvas_courses").select("*").eq("user_id", USER_ID).order("name"),
      db()
        .from("canvas_assignments")
        .select("*")
        .eq("user_id", USER_ID)
        .order("due_at", { ascending: true, nullsFirst: false }),
    ]);
    if (cRes.error || aRes.error) return { configured, courses: [] };

    const byCourse = new Map<string, CanvasAssignmentDTO[]>();
    for (const a of aRes.data ?? []) {
      const dto: CanvasAssignmentDTO = {
        id: String(a.canvas_id),
        name: String(a.name),
        dueAt: (a.due_at as string) ?? null,
        points: a.points_possible != null ? Number(a.points_possible) : null,
        kind: (a.kind as CanvasAssignmentDTO["kind"]) ?? "assignment",
        submitted: Boolean(a.submitted),
        graded: Boolean(a.graded),
        score: a.score != null ? Number(a.score) : null,
        url: (a.html_url as string) ?? null,
      };
      const key = String(a.course_canvas_id);
      byCourse.set(key, [...(byCourse.get(key) ?? []), dto]);
    }

    const courses: CanvasCourseDTO[] = (cRes.data ?? []).map((c) => ({
      id: String(c.canvas_id),
      name: String(c.name),
      code: (c.course_code as string) ?? null,
      term: (c.term as string) ?? null,
      score: c.current_score != null ? Number(c.current_score) : null,
      grade: (c.current_grade as string) ?? null,
      assignments: byCourse.get(String(c.canvas_id)) ?? [],
    }));
    return { configured, courses };
  } catch {
    return { configured, courses: [] };
  }
}

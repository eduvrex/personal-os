import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Chainable Supabase query recorder (see privacy.test.ts) ---------------

interface DbCall {
  method: string;
  args: unknown[];
}

class DbRecorder {
  ops: { table: string; calls: DbCall[] }[] = [];

  from(table: string) {
    const op = { table, calls: [] as DbCall[] };
    this.ops.push(op);
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
          }
          return (...args: unknown[]) => {
            op.calls.push({ method: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  }

  /** Chains on `table` that called `.delete()`, as method→args call lists. */
  deletes(table: string): DbCall[][] {
    return this.ops
      .filter((o) => o.table === table && o.calls.some((c) => c.method === "delete"))
      .map((o) => o.calls);
  }
}

let recorder: DbRecorder;

vi.mock("@/lib/db", () => ({
  db: () => ({ from: (table: string) => recorder.from(table) }),
  USER_ID: "eduardo",
}));

import { detectKind, parseNextLink, runCanvasSync } from "@/lib/canvas";

describe("parseNextLink — Canvas pagination", () => {
  it("finds rel=next among links", () => {
    const h = '<https://x.edu/api/v1/courses?page=1&per_page=100>; rel="current",' +
      '<https://x.edu/api/v1/courses?page=2&per_page=100>; rel="next",' +
      '<https://x.edu/api/v1/courses?page=4&per_page=100>; rel="last"';
    expect(parseNextLink(h)).toBe("https://x.edu/api/v1/courses?page=2&per_page=100");
  });
  it("null on last page / missing header", () => {
    expect(parseNextLink('<https://x.edu/a?page=4>; rel="last"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
  });
});

describe("detectKind — calendar category mapping", () => {
  it("exams by name beat quiz flags", () => {
    expect(detectKind({ name: "Midterm Exam", is_quiz_assignment: true })).toBe("exam");
    expect(detectKind({ name: "Final Project Report" })).toBe("project");
  });
  it("quizzes by flag or submission type", () => {
    expect(detectKind({ name: "Week 3 Quiz", is_quiz_assignment: true })).toBe("quiz");
    expect(detectKind({ name: "Reading check", submission_types: ["online_quiz"] })).toBe("quiz");
  });
  it("defaults to assignment", () => {
    expect(detectKind({ name: "Problem Set 4", submission_types: ["online_upload"] })).toBe("assignment");
  });
});

describe("runCanvasSync — prunes rows removed upstream", () => {
  const ok = (payload: unknown) =>
    ({
      ok: true,
      json: async () => payload,
      text: async () => "",
      headers: { get: () => null },
    }) as unknown as Response;

  /** Serve /courses and /courses/:id/assignments from an in-memory upstream. */
  function stubUpstream(
    courses: unknown[] | "fail",
    assignmentsByCourse: Record<string, unknown[] | "fail">,
  ) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const m = String(url).match(/\/courses\/(\d+)\/assignments/);
        if (m) {
          const a = assignmentsByCourse[m[1]] ?? [];
          if (a === "fail") return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
          return ok(a);
        }
        if (courses === "fail") return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
        return ok(courses);
      }),
    );
  }

  const has = (calls: DbCall[], method: string, ...args: unknown[]) =>
    calls.some((c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args));

  beforeEach(() => {
    recorder = new DbRecorder();
    process.env.CANVAS_BASE_URL = "https://canvas.test";
    process.env.CANVAS_ACCESS_TOKEN = "tok";
  });

  afterEach(() => {
    delete process.env.CANVAS_BASE_URL;
    delete process.env.CANVAS_ACCESS_TOKEN;
    vi.unstubAllGlobals();
  });

  it("deletes courses and assignments missing from a successful fetch, scoped to synced courses", async () => {
    stubUpstream(
      [
        { id: 1, name: "Math" },
        { id: 2, name: "Bio" },
      ],
      { "1": [{ id: 11, name: "HW1" }, { id: 12, name: "HW2" }], "2": [{ id: 21, name: "Lab" }] },
    );

    const res = await runCanvasSync();
    expect(res).toEqual({ configured: true, courses: 2, assignments: 3 });

    // Courses gone upstream are pruned…
    const coursePrunes = recorder.deletes("canvas_courses");
    expect(coursePrunes.length).toBe(1);
    expect(has(coursePrunes[0], "eq", "user_id", "eduardo")).toBe(true);
    expect(has(coursePrunes[0], "not", "canvas_id", "in", "(1,2)")).toBe(true);

    // …along with their assignments, and stale assignments of synced courses.
    const assignmentPrunes = recorder.deletes("canvas_assignments");
    expect(assignmentPrunes.length).toBe(2);
    const [orphans, scoped] = assignmentPrunes;
    expect(has(orphans, "not", "course_canvas_id", "in", "(1,2)")).toBe(true);
    expect(has(scoped, "in", "course_canvas_id", [1, 2])).toBe(true);
    expect(has(scoped, "not", "canvas_id", "in", "(11,12,21)")).toBe(true);
    for (const calls of assignmentPrunes) {
      expect(has(calls, "eq", "user_id", "eduardo")).toBe(true);
    }
  });

  it("a failed course fetch throws before anything is deleted", async () => {
    stubUpstream("fail", {});
    await expect(runCanvasSync()).rejects.toThrow(/Canvas \/courses failed/);
    expect(recorder.deletes("canvas_courses").length).toBe(0);
    expect(recorder.deletes("canvas_assignments").length).toBe(0);
  });

  it("a failed assignment fetch mid-sync throws before anything is deleted", async () => {
    stubUpstream(
      [
        { id: 1, name: "Math" },
        { id: 2, name: "Bio" },
      ],
      { "1": [{ id: 11, name: "HW1" }], "2": "fail" },
    );
    await expect(runCanvasSync()).rejects.toThrow(/assignments failed/);
    expect(recorder.deletes("canvas_courses").length).toBe(0);
    expect(recorder.deletes("canvas_assignments").length).toBe(0);
  });
});

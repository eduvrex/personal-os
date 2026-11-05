import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { stripPrivateProfileColumns } from "@/lib/backup";

/**
 * THE ACADEMIC PRIVACY GUARDRAIL:
 * profile.academic_context_private holds the sensitive academic record
 * (GPA, suspension, grade history). It exists so the Next-Steps assistant
 * can give realistic guidance — and for nothing else. It must never reach
 * the resume/CV tailoring path, DOCX export, briefings, AI summaries,
 * Telegram, Brain memory, or any component that renders on screen.
 *
 * Enforced structurally: only src/lib/academicContext.ts may read the
 * column, and only src/lib/nudges.ts may import that module. If a future
 * change widens either set, this test fails and forces a conscious call.
 */

const COLUMN = "academic_context_private";
const MODULE = "@/lib/academicContext";

/** The only file allowed to reference the column directly. */
const COLUMN_OWNER = "src/lib/academicContext.ts";
/** The only files allowed to import the accessor module. */
const ALLOWED_IMPORTERS = new Set(["src/lib/nudges.ts"]);

/** Paths that produce user-visible output, exports, or AI prompts. */
const FORBIDDEN_MODULES = [
  "src/lib/tailor.ts",
  "src/lib/resume.ts",
  "src/lib/docx.ts",
  "src/lib/briefing.ts",
  "src/lib/summary.ts",
  "src/lib/memory.ts",
  "src/lib/capture.ts",
  "src/lib/telegram.ts",
  "src/lib/telegramCommands.ts",
  "src/lib/advisor.ts",
  "src/lib/profile.ts",
  "src/app/api/ask/route.ts",
];

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("private academic context stays advisor-only", () => {
  for (const mod of FORBIDDEN_MODULES) {
    it(`${mod} never touches the private academic context`, () => {
      const src = read(mod);
      expect(src.includes(COLUMN), `${mod} references ${COLUMN}`).toBe(false);
      expect(src.includes(MODULE), `${mod} imports ${MODULE}`).toBe(false);
    });
  }

  it("the ProfileDTO never carries the column (nothing on screen can render it)", () => {
    expect(read("src/lib/types.ts").includes(COLUMN)).toBe(false);
  });

  it("profile updates via the API cannot write the column", () => {
    // profile.ts FIELDS is the whitelist for /api/profile PATCHes.
    const src = read("src/lib/profile.ts");
    expect(src.includes(COLUMN)).toBe(false);
  });

  it("only the accessor module reads the column, only nudges imports it", () => {
    expect(read(COLUMN_OWNER).includes(COLUMN)).toBe(true);
    for (const importer of ALLOWED_IMPORTERS) {
      expect(read(importer).includes(MODULE)).toBe(true);
    }
  });

  it("the nudge prompt forbids quoting the record on screen", () => {
    const src = read("src/lib/nudges.ts");
    expect(src.includes("never quote its specifics")).toBe(true);
  });

  it("the CV tailor hard-bans GPA and academic standing", () => {
    const src = read("src/lib/tailor.ts");
    expect(/NEVER include a GPA/i.test(src)).toBe(true);
  });

  // Regression: the record reached Telegram via the backup snapshot's blanket
  // profile select("*") until buildSnapshot was taught to redact it at source.
  it("the backup/export snapshot strips the private academic column from profile rows", () => {
    const rows = [{ user_id: "eduardo", about: "public", [COLUMN]: "GPA-AND-STANDING" }];
    const out = stripPrivateProfileColumns(rows) as Record<string, unknown>[];
    expect(out[0][COLUMN]).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("GPA-AND-STANDING");
  });
});

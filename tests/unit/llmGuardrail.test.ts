import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE LLM-IMPORT GUARDRAIL (companion to healthGuardrail.test.ts):
 * every module that talks to an LLM provider is a potential egress for
 * private data, so LLM access stays consciously reviewed. Two rings:
 *
 *  1. The provider SDKs may be imported by EXACTLY ONE file — src/lib/ai.ts,
 *     the shared AI core (clients, timeouts, model tiers, output parsing).
 *  2. The set of files importing that core is itself an allowlist — a new AI
 *     surface fails this test until someone reviews the module (health
 *     guardrail, prompt contents, privacy tiers, secrets) and adds it here.
 */

/** Ring 1 — the only file allowed to import an LLM SDK. */
const LLM_SDK_ALLOWLIST = ["src/lib/ai.ts"];

/** Ring 2 — reviewed AI surfaces allowed to import the AI core. Keep sorted. */
const AI_CORE_IMPORT_ALLOWLIST = [
  "src/app/api/ask/route.ts",
  "src/app/api/personal/support/route.ts",
  "src/lib/advisor.ts",
  "src/lib/applications.ts",
  "src/lib/nudges.ts",
  "src/lib/router/classifyCapture.ts",
  "src/lib/tailor.ts",
  "src/lib/transcribe.ts",
];

const SCAN_ROOTS = ["src/app/api", "src/lib"];

/** Matches static imports, re-exports, require(), and dynamic import() of the SDKs (incl. subpaths). */
const LLM_IMPORT_RE =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'](?:@anthropic-ai\/sdk|openai)(?:\/[^"']*)?["']/;

/** Matches any import/require of the shared AI core. */
const AI_CORE_IMPORT_RE =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["']@\/lib\/ai["']/;

function tsFilesUnder(root: string): string[] {
  const abs = path.resolve(process.cwd(), root);
  return readdirSync(abs, { recursive: true, encoding: "utf8" })
    .filter((rel) => rel.endsWith(".ts") || rel.endsWith(".tsx"))
    .map((rel) => path.join(root, rel).split(path.sep).join("/"));
}

function importersMatching(re: RegExp): string[] {
  return SCAN_ROOTS.flatMap(tsFilesUnder)
    .filter((rel) => re.test(readFileSync(path.resolve(process.cwd(), rel), "utf8")))
    .sort();
}

describe("LLM access stays on the reviewed allowlists", () => {
  it("only src/lib/ai.ts imports an LLM SDK", () => {
    expect(importersMatching(LLM_IMPORT_RE)).toEqual(LLM_SDK_ALLOWLIST);
  });

  it("the set of files importing the AI core equals the allowlist", () => {
    const importers = importersMatching(AI_CORE_IMPORT_RE).filter(
      (rel) => rel !== "src/lib/ai.ts",
    );
    expect(importers).toEqual(AI_CORE_IMPORT_ALLOWLIST);
  });

  it("the allowlists stay sorted and duplicate-free (readability guard)", () => {
    for (const list of [LLM_SDK_ALLOWLIST, AI_CORE_IMPORT_ALLOWLIST]) {
      expect(list).toEqual([...new Set(list)].sort());
    }
  });
});

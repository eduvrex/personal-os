import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { formatKnowledge, privateItems, publicItems } from "@/lib/knowledgeBase";
import { stripPrivateKnowledgeRows } from "@/lib/backup";

/**
 * THE KNOWLEDGE-BASE PRIVACY TIER:
 * items marked 'private' are advisor-only — never on Home, never in a résumé/CV,
 * never in public nudges or shared/exported views. Structurally:
 *   - the public nudge engine reads ONLY the public tier;
 *   - only the private-reasoning consumers (advisor + Ask-my-OS) read the full KB;
 *   - résumé/CV and Brain-memory paths never read the KB at all;
 *   - backups/exports strip the private tier at source.
 */

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const SAMPLE = [
  { tier: "public", section: "Snapshot", content: "Econ undergrad, native EN/ES" },
  { tier: "private", section: "Money", content: "SECRET-DEBT-FIGURE" },
  { tier: "private", section: "Health", content: "SECRET-CARE-DETAIL" },
];

describe("knowledge-base tier split (pure)", () => {
  it("publicItems keeps only public entries", () => {
    const pub = publicItems(SAMPLE);
    expect(pub).toHaveLength(1);
    expect(JSON.stringify(pub)).not.toContain("SECRET");
  });

  it("privateItems keeps only private entries", () => {
    expect(privateItems(SAMPLE)).toHaveLength(2);
  });

  it("a public-only context never contains private content", () => {
    const text = formatKnowledge(publicItems(SAMPLE));
    expect(text).not.toContain("SECRET-DEBT-FIGURE");
    expect(text).not.toContain("SECRET-CARE-DETAIL");
    expect(text).toContain("Snapshot");
  });

  it("backups/exports strip the private tier", () => {
    const out = stripPrivateKnowledgeRows(SAMPLE);
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });
});

describe("knowledge-base tier wiring (structural)", () => {
  it("the nudge engine reads ONLY the public tier", () => {
    const src = read("src/lib/nudges.ts");
    expect(src.includes("publicKnowledgeContext"), "nudges must use the public accessor").toBe(true);
    expect(src.includes("fullKnowledgeContext"), "nudges must NOT read the full/private KB").toBe(false);
  });

  it("only the private-reasoning consumers read the full KB", () => {
    expect(read("src/lib/advisor.ts").includes("fullKnowledgeContext")).toBe(true);
    expect(read("src/app/api/ask/route.ts").includes("fullKnowledgeContext")).toBe(true);
  });

  it("résumé/CV drafting and Brain memory never read the knowledge base", () => {
    for (const mod of [
      "src/lib/resume.ts",
      "src/lib/tailor.ts",
      "src/lib/docx.ts",
      "src/lib/memory.ts",
    ]) {
      expect(read(mod).includes("@/lib/knowledgeBase"), `${mod} must not read the KB`).toBe(false);
    }
  });

  it("backups redact the private knowledge tier at source", () => {
    expect(read("src/lib/backup.ts").includes("stripPrivateKnowledgeRows")).toBe(true);
  });
});

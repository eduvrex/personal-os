import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LOCKIN,
  LOCKIN_DAILY_IDS,
  cleanIds,
  daysBetween,
  fullDays,
  isLockinActive,
  lockinDay,
  nextMajor,
  upcomingKeyDates,
} from "@/lib/config/lockin";

describe("lock-in date math", () => {
  it("counts whole days, negative once a date has passed", () => {
    expect(daysBetween("2026-11-04", "2026-11-11")).toBe(7);
    expect(daysBetween("2026-11-30", "2026-12-01")).toBe(1);
    expect(daysBetween("2026-12-10", "2026-12-09")).toBe(-1);
  });

  it("is active only inside its window, inclusive", () => {
    expect(isLockinActive(LOCKIN.start)).toBe(LOCKIN.enabled);
    expect(isLockinActive(LOCKIN.end)).toBe(LOCKIN.enabled);
    expect(isLockinActive("2026-11-03")).toBe(false);
    expect(isLockinActive("2026-12-10")).toBe(false);
  });

  it("numbers the run from day 1 and clamps at both ends", () => {
    const total = daysBetween(LOCKIN.start, LOCKIN.end) + 1;
    expect(lockinDay(LOCKIN.start)).toEqual({ day: 1, total });
    expect(lockinDay(LOCKIN.end)).toEqual({ day: total, total });
    expect(lockinDay("2027-01-01").day).toBe(total);
  });

  it("leads with the next exam, skipping non-exam dates and past ones", () => {
    expect(nextMajor("2026-11-04")?.label).toBe("Midterm #3");
    expect(nextMajor("2026-11-12")?.course).toBe("HIST 210");
    expect(nextMajor("2026-12-10")).toBeNull();
    expect(upcomingKeyDates("2026-12-08").map((d) => d.course)).toEqual(["ECON 301", "STAT 250"]);
  });
});

describe("lock-in ticks", () => {
  it("keeps only known ids, de-duplicated", () => {
    expect(cleanIds(["classes", "classes", "bogus", 7], "daily")).toEqual(["classes"]);
    expect(cleanIds(["advising", "classes"], "unblock")).toEqual(["advising"]);
    expect(cleanIds("nope", "daily")).toEqual([]);
  });

  it("counts a day toward the streak only when every check is done", () => {
    const all = [...LOCKIN_DAILY_IDS];
    const days = fullDays([
      { date: "2026-11-05", done: all },
      { date: "2026-11-06", done: all.slice(1) },
      { date: "2026-11-01", done: all }, // before lock-in started
    ]);
    expect([...days]).toEqual(["2026-11-05"]);
  });
});

describe("lock-in page stays free of the private academic record", () => {
  const files = [
    "src/lib/config/lockin.ts",
    "src/lib/lockin.ts",
    "src/components/dashboard/LockInBoard.tsx",
    "src/app/api/lockin/route.ts",
  ];
  const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");
  // Comments may name the guardrail; strip them before scanning rendered code.
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const f of files) {
    it(`${f} never reads or renders GPA / academic standing`, () => {
      const src = read(f);
      expect(src.includes("academic_context_private")).toBe(false);
      expect(src.includes("@/lib/academicContext")).toBe(false);
      expect(/\bGPA\b|suspension|probation|academic warning/i.test(code(src))).toBe(false);
    });
  }
});

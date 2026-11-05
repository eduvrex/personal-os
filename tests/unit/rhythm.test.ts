import { describe, expect, it } from "vitest";

import { blocksForWeekday, orderBlocks } from "@/lib/rhythm";
import { deriveReadingProgress } from "@/lib/reading";
import { consecutiveDayStreak, prevDayKey } from "@/lib/localDate";
import type { RhythmBlockDTO } from "@/lib/types";

function block(p: Partial<RhythmBlockDTO>): RhythmBlockDTO {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    at_time: p.at_time ?? null,
    label: p.label ?? "block",
    detail: p.detail ?? null,
    kind: p.kind ?? null,
    days: p.days ?? [],
    sort: p.sort ?? 0,
    active: p.active ?? true,
  };
}

describe("orderBlocks", () => {
  it("orders by time, untimed last", () => {
    const out = orderBlocks([
      block({ label: "anytime", at_time: null }),
      block({ label: "evening", at_time: "21:00" }),
      block({ label: "morning", at_time: "07:30" }),
    ]);
    expect(out.map((b) => b.label)).toEqual(["morning", "evening", "anytime"]);
  });

  it("breaks time ties with sort", () => {
    const out = orderBlocks([
      block({ label: "b", at_time: "09:00", sort: 2 }),
      block({ label: "a", at_time: "09:00", sort: 1 }),
    ]);
    expect(out.map((b) => b.label)).toEqual(["a", "b"]);
  });
});

describe("blocksForWeekday", () => {
  const blocks = [
    block({ label: "daily", days: [] }),
    block({ label: "sundays", days: ["sun"], at_time: "19:30" }),
    block({ label: "weekdays", days: ["mon", "tue", "wed", "thu", "fri"], at_time: "09:00" }),
    block({ label: "paused", days: [], active: false }),
  ];

  it("includes every-day blocks and the matching weekday, excludes paused", () => {
    const mon = blocksForWeekday(blocks, "mon").map((b) => b.label);
    expect(mon).toContain("daily");
    expect(mon).toContain("weekdays");
    expect(mon).not.toContain("sundays");
    expect(mon).not.toContain("paused");
  });

  it("shows the Sunday review only on Sunday", () => {
    expect(blocksForWeekday(blocks, "sun").map((b) => b.label)).toContain("sundays");
    expect(blocksForWeekday(blocks, "wed").map((b) => b.label)).not.toContain("sundays");
  });
});

describe("deriveReadingProgress", () => {
  it("prefers page counts", () => {
    expect(deriveReadingProgress(150, 300, null)).toBe(50);
  });
  it("falls back to a stored percent", () => {
    expect(deriveReadingProgress(null, null, 42)).toBe(42);
  });
  it("is 100 when finished, regardless of pages", () => {
    expect(deriveReadingProgress(10, 300, null, "finished")).toBe(100);
  });
  it("is null with nothing to go on", () => {
    expect(deriveReadingProgress(null, null, null)).toBeNull();
  });
  it("clamps out-of-range page counts", () => {
    expect(deriveReadingProgress(400, 300, null)).toBe(100);
  });
});

describe("consecutiveDayStreak (gentle)", () => {
  it("counts back from today", () => {
    const days = new Set(["2026-07-03", "2026-07-02", "2026-07-01"]);
    expect(consecutiveDayStreak(days, "2026-07-03")).toBe(3);
  });
  it("still counts if today isn't logged yet but yesterday is", () => {
    const days = new Set(["2026-07-02", "2026-07-01"]);
    expect(consecutiveDayStreak(days, "2026-07-03")).toBe(2);
  });
  it("is 0 when neither today nor yesterday is present", () => {
    const days = new Set(["2026-06-20"]);
    expect(consecutiveDayStreak(days, "2026-07-03")).toBe(0);
  });
  it("stops at the first gap", () => {
    const days = new Set(["2026-07-03", "2026-07-02", "2026-06-30"]);
    expect(consecutiveDayStreak(days, "2026-07-03")).toBe(2);
  });
  it("prevDayKey crosses a month boundary", () => {
    expect(prevDayKey("2026-07-01")).toBe("2026-06-30");
  });
});

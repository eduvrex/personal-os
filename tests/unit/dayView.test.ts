import { describe, expect, it } from "vitest";

import { buildDay, currentIndex, durationFromLabel, summarizeDay } from "@/lib/dayView";
import type { RhythmBlockDTO } from "@/lib/types";

function block(at: string, label: string, kind: string, days: string[] = []): RhythmBlockDTO {
  return { id: `${at}-${label}`, at_time: at, label, detail: null, kind, days, sort: 0, active: true };
}

describe("durationFromLabel", () => {
  it("reads minutes and hours from the label", () => {
    expect(durationFromLabel("Deep work · STAT 250 (65 min)")).toBe(65);
    expect(durationFromLabel("Deep work · essay draft (2h)")).toBe(120);
    expect(durationFromLabel("Builder hour · Personal OS (cap 60 min)")).toBe(60);
    expect(durationFromLabel("Shutdown (5 min)")).toBe(5);
    expect(durationFromLabel("Lunch + short walk")).toBeNull();
  });
});

describe("buildDay", () => {
  const blocks = [
    block("07:00", "Wake", "anchor", ["mon"]),
    block("07:30", "Leave for campus", "anchor", ["mon"]),
    block("09:05", "STAT 250", "class", ["mon", "wed", "fri"]),
    block("10:00", "Deep work · STAT 250 (65 min)", "focus", ["mon"]),
    block("19:00", "Dinner", "meal"),
    block("23:00", "Sleep", "anchor"),
    block("08:00", "Tuesday only", "focus", ["tue"]),
  ];

  it("merges work shifts, orders by time, and filters by day", () => {
    const day = buildDay(blocks, "mon");
    const labels = day.map((d) => d.label);
    expect(labels).not.toContain("Tuesday only");
    expect(labels[2]).toMatch(/^Work/); // Monday 08:00–09:00 shift
    expect(day[2]).toMatchObject({ start: "08:00", end: "09:00", kind: "work" });
  });

  it("derives end times: label duration, next start, cap, open-ended last", () => {
    const day = buildDay(blocks, "mon");
    const by = (l: string) => day.find((d) => d.label.startsWith(l))!;
    expect(by("Wake").end).toBe("07:30");
    expect(by("Deep work").end).toBe("11:05");
    expect(by("Dinner").end).toBe("20:30"); // capped at 90 min
    expect(by("Sleep").end).toBeNull();
  });

  it("summarizes focus/class/work time and commute anchors", () => {
    const s = summarizeDay(buildDay(blocks, "mon"));
    expect(s.focusMin).toBe(65);
    expect(s.leave).toBe("07:30");
    expect(s.workMin).toBe(120);
  });

  it("finds the current item", () => {
    const day = buildDay(blocks, "mon");
    expect(day[currentIndex(day, "10:30")].label).toMatch(/Deep work/);
  });
});

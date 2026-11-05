import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: () => ({}), USER_ID: "eduardo" }));

import type { DayItem } from "@/lib/dayView";
import { checkinText, duePings, startText, wantsCheckin, wantsStartPing } from "@/lib/rhythmPings";

const id = (n: number) => `00000000-0000-0000-0000-00000000000${n}`;
const item = (p: Partial<DayItem>): DayItem => ({
  key: p.key ?? id(1),
  start: p.start ?? "08:00",
  end: p.end ?? null,
  label: p.label ?? "Block",
  detail: p.detail ?? null,
  kind: p.kind ?? "focus",
});

describe("which blocks ping", () => {
  it("nudges focus, akrov, review and commute blocks — not classes, meals or work", () => {
    expect(wantsStartPing(item({ kind: "focus" }))).toBe(true);
    expect(wantsStartPing(item({ kind: "akrov" }))).toBe(true);
    expect(wantsStartPing(item({ kind: "anchor", label: "Leave for campus" }))).toBe(true);
    expect(wantsStartPing(item({ kind: "anchor", label: "Head home" }))).toBe(true);
    expect(wantsStartPing(item({ kind: "class" }))).toBe(false);
    expect(wantsStartPing(item({ kind: "meal" }))).toBe(false);
    expect(wantsStartPing(item({ kind: "anchor", label: "Wake" }))).toBe(false);
  });

  it("checks in only after focus/akrov blocks of 30+ minutes", () => {
    expect(wantsCheckin(item({ start: "08:00", end: "09:15" }))).toBe(true);
    expect(wantsCheckin(item({ start: "10:50", end: "11:00" }))).toBe(false);
    expect(wantsCheckin(item({ kind: "class", start: "09:30", end: "10:45" }))).toBe(false);
  });
});

describe("duePings windows", () => {
  const day = [
    item({ key: id(1), kind: "anchor", label: "Leave for campus", start: "07:30", end: "08:00" }),
    item({ key: id(2), kind: "focus", label: "GRE (75 min)", start: "08:00", end: "09:15" }),
    item({ key: "work-1-0", kind: "work", label: "Work", start: "11:00", end: "14:00" }),
  ];

  it("sends the start nudge from 5 min before to 15 min after", () => {
    expect(duePings(day, "07:24").map((p) => p.item.key)).toEqual([]);
    expect(duePings(day, "07:25").map((p) => p.item.key)).toEqual([id(1)]);
    expect(duePings(day, "07:45").map((p) => p.item.key)).toEqual([id(1)]);
    expect(duePings(day, "07:46").map((p) => p.item.key)).toEqual([]);
  });

  it("sends the check-in within 30 min after the block ends", () => {
    const at = (hm: string) => duePings(day, hm).filter((p) => p.kind === "checkin").map((p) => p.item.key);
    expect(at("09:14")).toEqual([]);
    expect(at("09:15")).toEqual([id(2)]);
    expect(at("09:45")).toEqual([id(2)]);
    expect(at("09:46")).toEqual([]);
  });

  it("never pings for work shifts", () => {
    expect(duePings(day, "10:58")).toEqual([]);
  });
});

describe("message text", () => {
  it("includes the time range, note and next block", () => {
    const t = startText(
      item({ kind: "anchor", label: "Leave for campus", start: "07:30", end: "08:00", detail: "BCycle 48th & Arapahoe" }),
      item({ label: "GRE at the library", start: "08:00" }),
    );
    expect(t).toContain("7:30am–8:00am · Leave for campus");
    expect(t).toContain("BCycle 48th & Arapahoe");
    expect(t).toContain("Next: 8:00am GRE at the library");
    expect(checkinText(item({ label: "GRE", start: "08:00", end: "09:15" }))).toContain("How did it go?");
  });
});

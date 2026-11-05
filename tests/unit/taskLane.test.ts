import { describe, expect, it } from "vitest";

import { addDays, effectiveLane, isOverdue } from "@/lib/taskLane";

const TODAY = "2026-08-31";
const t = (due_date: string | null, urgency: string | null = null) =>
  ({ due_date, urgency }) as Parameters<typeof effectiveLane>[0];

describe("effectiveLane", () => {
  it("files an undated task by its stored urgency", () => {
    expect(effectiveLane(t(null, "later"), TODAY)).toBe("later");
    expect(effectiveLane(t(null, "today"), TODAY)).toBe("today");
  });

  it("treats an undated, untriaged task as inbox", () => {
    expect(effectiveLane(t(null, null), TODAY)).toBe("inbox");
  });

  it("puts work due today in Today", () => {
    expect(effectiveLane(t(TODAY, "later"), TODAY)).toBe("today");
  });

  it("keeps overdue work in Today rather than hiding it", () => {
    expect(effectiveLane(t("2026-08-20", "later"), TODAY)).toBe("today");
    expect(isOverdue(t("2026-08-20"), TODAY)).toBe(true);
    expect(isOverdue(t(TODAY), TODAY)).toBe(false);
  });

  it("puts the next seven days in This week, inclusive", () => {
    expect(effectiveLane(t("2026-09-01"), TODAY)).toBe("week");
    expect(effectiveLane(t("2026-09-07"), TODAY)).toBe("week");
  });

  it("parks anything past the week in Later", () => {
    expect(effectiveLane(t("2026-09-08"), TODAY)).toBe("later");
    expect(effectiveLane(t("2026-12-05"), TODAY)).toBe("later");
  });

  it("lets due_date override a stale stored urgency", () => {
    // Loaded in August as 'later'; on the day it is due it must surface.
    expect(effectiveLane(t("2026-09-23", "later"), "2026-09-23")).toBe("today");
  });

  it("crosses month and year boundaries", () => {
    expect(addDays("2026-08-31", 7)).toBe("2026-09-07");
    expect(effectiveLane(t("2027-01-02"), "2026-12-31")).toBe("week");
  });
});

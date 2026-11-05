import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: vi.fn(), USER_ID: "eduardo" }));
vi.mock("@/lib/applications", () => ({ createApplication: vi.fn() }));
vi.mock("@/lib/calendar", () => ({ createEvent: vi.fn(), deleteEvent: vi.fn() }));
vi.mock("@/lib/courses", () => ({ listCourses: vi.fn(async () => []) }));
vi.mock("@/lib/journal", () => ({ addJournal: vi.fn() }));
vi.mock("@/lib/memory", () => ({ addMemory: vi.fn(), removeMemoryByCustomIds: vi.fn() }));
vi.mock("@/lib/plans", () => ({ createPlan: vi.fn() }));
vi.mock("@/lib/reading", () => ({ addBook: vi.fn() }));
vi.mock("@/lib/tasks", () => ({ createTask: vi.fn() }));

import { urgencyFor } from "@/lib/capture";

describe("capture v3 task placement", () => {
  it("keeps undated actions in the inbox", () => {
    expect(urgencyFor(null)).toBe("inbox");
  });

  it("maps dated actions to planning horizons", () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: process.env.USER_TIMEZONE ?? "Europe/Madrid" });
    expect(urgencyFor(today)).toBe("today");
  });
});

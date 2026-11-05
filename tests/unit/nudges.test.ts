import { describe, expect, it, vi } from "vitest";

// nudges.ts pulls the whole gather-context import graph; the pure matcher
// under test never touches these.
vi.mock("@/lib/db", () => ({ db: () => ({}), USER_ID: "eduardo" }));
vi.mock("@/lib/memory", () => ({
  addMemory: vi.fn(async () => undefined),
  removeMemoryByCustomIds: vi.fn(async () => 0),
}));

import { matchPlanId } from "@/lib/nudges";

const ids = new Map([
  ["eu", "id-eu"],
  ["move", "id-move"],
  ["move to barcelona", "id-bcn"],
  ["finance track", "id-fin"],
]);

describe("matchPlanId — nudge → plan linking", () => {
  it("exact title matches win at any length (case-insensitive, trimmed)", () => {
    expect(matchPlanId("EU", ids)).toBe("id-eu");
    expect(matchPlanId(" Move ", ids)).toBe("id-move");
  });

  it("short titles never substring-match ('EU' inside 'Europe')", () => {
    expect(matchPlanId("Career in Europe", ids)).toBeNull();
    expect(matchPlanId("Moved apartments", ids)).toBeNull();
  });

  it("long titles still substring-match in both directions", () => {
    // name contains the title…
    expect(matchPlanId("the Move to Barcelona plan", ids)).toBe("id-bcn");
    // …and the title contains the name (name must be ≥ 6 chars).
    expect(matchPlanId("Barcelona", ids)).toBe("id-bcn");
    expect(matchPlanId("Finance", ids)).toBe("id-fin");
  });

  it("missing or unknown names link to nothing", () => {
    expect(matchPlanId(null, ids)).toBeNull();
    expect(matchPlanId(undefined, ids)).toBeNull();
    expect(matchPlanId("", ids)).toBeNull();
    expect(matchPlanId("Sourdough baking", ids)).toBeNull();
  });
});

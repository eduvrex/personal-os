import { describe, expect, it, vi } from "vitest";

/** H4: the workout ingest contract's body parsing (pure). */

vi.mock("@/lib/db", () => ({ db: () => ({}), USER_ID: "eduardo" }));

import { dedupeByExternalId, parseIngestBody, parseManualBody } from "@/lib/fitness";
import { ValidationError } from "@/lib/validate";

const valid = {
  external_id: "lift-2026-07-01-a",
  name: "Push day",
  type: "strength",
  performed_at: "2026-07-01T18:30:00Z",
  duration_min: 55,
  notes: "PR on bench",
  data: { exercises: [{ name: "Bench", sets: 5 }] },
};

describe("parseIngestBody", () => {
  it("accepts a single workout object", () => {
    const items = parseIngestBody(valid);
    expect(items).toHaveLength(1);
    expect(items[0].external_id).toBe("lift-2026-07-01-a");
    expect(items[0].source).toBe("external");
  });

  it("accepts { workouts: [...] } batches", () => {
    const items = parseIngestBody({ workouts: [valid, { ...valid, external_id: "b" }] });
    expect(items.map((w) => w.external_id)).toEqual(["lift-2026-07-01-a", "b"]);
  });

  it("requires external_id on every item (the idempotency key)", () => {
    const rest: Record<string, unknown> = { ...valid };
    delete rest.external_id;
    expect(() => parseIngestBody(rest)).toThrow(ValidationError);
    expect(() => parseIngestBody({ workouts: [valid, rest] })).toThrow(ValidationError);
  });

  it("requires name and performed_at, rejects bad dates and huge batches", () => {
    expect(() => parseIngestBody({ ...valid, name: "" })).toThrow(ValidationError);
    expect(() => parseIngestBody({ ...valid, performed_at: "not-a-date" })).toThrow(ValidationError);
    expect(() => parseIngestBody({ workouts: [] })).toThrow(ValidationError);
    expect(() =>
      parseIngestBody({ workouts: Array.from({ length: 101 }, (_, i) => ({ ...valid, external_id: `w${i}` })) }),
    ).toThrow(ValidationError);
  });

  it("caps the data payload size", () => {
    expect(() =>
      parseIngestBody({ ...valid, data: { blob: "x".repeat(25_000) } }),
    ).toThrow(ValidationError);
  });
});

describe("dedupeByExternalId", () => {
  it("keeps the last occurrence of a repeated id (a repeat would abort the upsert)", () => {
    const items = parseIngestBody({
      workouts: [valid, { ...valid, name: "Push day v2" }, { ...valid, external_id: "b" }],
    });
    const deduped = dedupeByExternalId(items);
    expect(deduped.map((w) => w.external_id)).toEqual(["lift-2026-07-01-a", "b"]);
    expect(deduped[0].name).toBe("Push day v2");
  });
});

describe("parseManualBody", () => {
  it("needs no external_id and defaults source to manual", () => {
    const w = parseManualBody({ name: "Evening run", performed_at: "2026-07-02T20:00:00Z" });
    expect(w.external_id).toBeNull();
    expect(w.source).toBe("manual");
    expect(w.duration_min).toBeNull();
  });
});

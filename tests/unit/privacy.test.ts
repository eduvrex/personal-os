import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE PRIVACY INVARIANT:
 * Private journal entries and the Personal space must be excluded from
 * (1) the public Reflect feed / Home preview, (2) the memory layer (Brain
 * search), and (3) the nudge engine's inputs.
 */

// --- Chainable Supabase query recorder -------------------------------------

interface Call {
  method: string;
  args: unknown[];
}

class QueryRecorder {
  calls: Call[] = [];
  result: { data: unknown; error: null } = { data: [], error: null };
  insertPayload: Record<string, unknown> | null = null;

  private chain(method: string) {
    return (...args: unknown[]) => {
      this.calls.push({ method, args });
      if (method === "insert") {
        this.insertPayload = args[0] as Record<string, unknown>;
        // Echo the payload back as the inserted row.
        this.result = {
          data: { id: "00000000-0000-4000-8000-000000000001", ...this.insertPayload },
          error: null,
        };
      }
      return this.proxy;
    };
  }

  proxy: Record<string, unknown>;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.proxy = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(self.result);
          }
          return self.chain(prop);
        },
      },
    );
  }

  has(method: string, ...args: unknown[]): boolean {
    return this.calls.some(
      (c) => c.method === method && JSON.stringify(c.args) === JSON.stringify(args),
    );
  }
}

let recorder: QueryRecorder;
const addMemoryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: () => recorder.proxy,
  USER_ID: "eduardo",
}));
vi.mock("@/lib/memory", () => ({
  addMemory: (...args: unknown[]) => addMemoryMock(...args),
  removeMemoryByCustomIds: vi.fn(async () => 0),
}));

import { addJournal, latestJournal, listJournal } from "@/lib/journal";
import { filterNudgeCaptures } from "@/lib/nudges";

beforeEach(() => {
  recorder = new QueryRecorder();
  addMemoryMock.mockClear();
});

describe("public journal reads exclude the Personal space and private entries", () => {
  it("listJournal filters personal=false", async () => {
    await listJournal(30);
    expect(recorder.has("eq", "personal", false)).toBe(true);
  });

  it("latestJournal (Home preview) filters personal=false AND private=false", async () => {
    recorder.result = { data: null, error: null };
    await latestJournal();
    expect(recorder.has("eq", "personal", false)).toBe(true);
    expect(recorder.has("eq", "private", false)).toBe(true);
  });
});

describe("the memory layer never sees personal check-ins", () => {
  it("a personal check-in is NOT indexed", async () => {
    await addJournal({ text: "feeling low today", personal: true });
    expect(addMemoryMock).not.toHaveBeenCalled();
    // …and it is stored flagged personal.
    expect(recorder.insertPayload?.personal).toBe(true);
  });

  it("an entry created ALREADY-private is NOT indexed (review finding)", async () => {
    await addJournal({ text: "tender thoughts", private: true });
    expect(addMemoryMock).not.toHaveBeenCalled();
    expect(recorder.insertPayload?.private).toBe(true);
  });

  it("a normal entry IS indexed", async () => {
    await addJournal({ text: "productive day at the library" });
    expect(addMemoryMock).toHaveBeenCalledTimes(1);
  });

  it("skipMemory (capture pipeline) also suppresses indexing", async () => {
    await addJournal({ text: "routed from capture", skipMemory: true });
    expect(addMemoryMock).not.toHaveBeenCalled();
  });
});

describe("the nudge engine's inputs exclude private content", () => {
  const captures = [
    { raw_text: "buy groceries", routed_to: "task", routed_id: "t1" },
    { raw_text: "missing my love", routed_to: "personal", routed_id: "p1" },
    { raw_text: "tough day entry", routed_to: "journal", routed_id: "priv-entry" },
    { raw_text: "normal reflection", routed_to: "journal", routed_id: "pub-entry" },
    { raw_text: "an idea", routed_to: "note", routed_id: null },
  ];

  it("drops personal-space captures and captures routed to private entries", () => {
    const out = filterNudgeCaptures(captures, new Set(["priv-entry"]));
    expect(out.map((c) => c.raw_text)).toEqual([
      "buy groceries",
      "normal reflection",
      "an idea",
    ]);
  });

  it("keeps everything when nothing is private", () => {
    const safe = captures.filter((c) => c.routed_to !== "personal");
    expect(filterNudgeCaptures(safe, new Set())).toHaveLength(4);
  });
});

import { describe, expect, it } from "vitest";

import { extractJson, lightModel, heavyModel, textFrom } from "@/lib/ai";
import { CLASSIFIER_MAX_TOKENS } from "@/lib/router/classifyCapture";
import type Anthropic from "@anthropic-ai/sdk";

describe("extractJson", () => {
  it("parses bare JSON objects and arrays", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("strips ```json fences (with or without trailing newline)", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n[1,2]\n```')).toEqual([1, 2]);
  });

  it("recovers JSON wrapped in prose — the failure mode that wasted paid calls", () => {
    expect(
      extractJson('Here are your nudges:\n[{"text":"Draft the SOP","priority":1}]\nHope this helps!'),
    ).toEqual([{ text: "Draft the SOP", priority: 1 }]);
  });

  it("returns null for truncated output instead of throwing", () => {
    expect(extractJson('[{"text":"Draft the SOP","prio')).toBeNull();
    expect(extractJson("")).toBeNull();
    expect(extractJson(null)).toBeNull();
    expect(extractJson("no json here at all")).toBeNull();
  });
});

describe("textFrom", () => {
  it("joins text blocks and skips thinking blocks (extended-thinking safe)", () => {
    const res = {
      content: [
        { type: "thinking", thinking: "private scratchpad", signature: "x" },
        { type: "text", text: "Hello " },
        { type: "text", text: "world." },
      ],
    } as unknown as Anthropic.Message;
    expect(textFrom(res)).toBe("Hello world.");
  });
});

describe("model tiers", () => {
  it("expose non-empty defaults so every surface always has a model", () => {
    expect(lightModel().length).toBeGreaterThan(0);
    expect(heavyModel().length).toBeGreaterThan(0);
  });
});

describe("classifier reply budget", () => {
  it("fits five worst-case extraction items (the old 200 cap truncated multi-item captures)", () => {
    expect(CLASSIFIER_MAX_TOKENS).toBeGreaterThanOrEqual(1024);
  });
});

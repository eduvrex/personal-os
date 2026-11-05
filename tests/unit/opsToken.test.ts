import { createHmac } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { opsToken, verifyOpsKey } from "@/lib/opsToken";

const ORIGINAL = process.env.AUTH_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL;
});

describe("opsToken", () => {
  it("derives the documented HMAC so offline holders of .env.local can recompute it", () => {
    process.env.AUTH_SECRET = "test-secret";
    const expected = createHmac("sha256", "test-secret")
      .update("personal-os:ops:v1")
      .digest("hex");
    expect(opsToken()).toBe(expected);
    expect(verifyOpsKey(expected)).toBe(true);
  });

  it("rejects wrong, empty, and near-miss keys", () => {
    process.env.AUTH_SECRET = "test-secret";
    const good = opsToken()!;
    expect(verifyOpsKey(good.slice(0, -1) + (good.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(verifyOpsKey(good.slice(0, -1))).toBe(false);
    expect(verifyOpsKey("")).toBe(false);
    expect(verifyOpsKey(null)).toBe(false);
  });

  it("fail-closes when AUTH_SECRET is unset — nothing verifies", () => {
    delete process.env.AUTH_SECRET;
    expect(opsToken()).toBeNull();
    expect(verifyOpsKey("anything")).toBe(false);
  });
});

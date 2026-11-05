import { beforeAll, describe, expect, it } from "vitest";

import {
  createSessionToken,
  safeEqual,
  secretsMatch,
  verifyApiSecret,
  verifySessionToken,
} from "@/lib/auth/session";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-unit-tests";
});

describe("auth gate primitives", () => {
  it("round-trips a session token", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects missing/malformed/tampered tokens", async () => {
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("garbage")).toBe(false);
    const token = await createSessionToken();
    const [payload, sig] = token.split(".");
    // Tamper with the payload — signature no longer matches.
    const forged = `${payload.slice(0, -2)}xx.${sig}`;
    expect(await verifySessionToken(forged)).toBe(false);
    // Tamper with the signature.
    expect(await verifySessionToken(`${payload}.${"0".repeat(sig.length)}`)).toBe(false);
  });

  it("rejects tokens signed with a different secret", async () => {
    const token = await createSessionToken();
    process.env.AUTH_SECRET = "rotated-secret";
    expect(await verifySessionToken(token)).toBe(false);
    process.env.AUTH_SECRET = "test-secret-for-unit-tests";
  });

  it("verifyApiSecret matches only the exact shared secret", async () => {
    expect(await verifyApiSecret("test-secret-for-unit-tests")).toBe(true);
    expect(await verifyApiSecret("wrong")).toBe(false);
    expect(await verifyApiSecret(null)).toBe(false);
  });

  it("safeEqual / secretsMatch behave on unequal lengths", async () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(await secretsMatch("a", "a")).toBe(true);
    expect(await secretsMatch("a", "b")).toBe(false);
  });
});

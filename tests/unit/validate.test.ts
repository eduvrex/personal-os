import { describe, expect, it } from "vitest";

import {
  asObject,
  isUuid,
  keyDateArray,
  milestoneArray,
  oneOf,
  optDateKey,
  optHexColor,
  optIsoDate,
  optNum,
  optStr,
  reqStr,
  strArray,
  ValidationError,
} from "@/lib/validate";

describe("asObject", () => {
  it("accepts plain objects", () => {
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
  });
  it("rejects null, arrays, and primitives", () => {
    expect(() => asObject(null)).toThrow(ValidationError);
    expect(() => asObject([1])).toThrow(ValidationError);
    expect(() => asObject("x")).toThrow(ValidationError);
  });
});

describe("reqStr / optStr", () => {
  it("trims and enforces caps", () => {
    expect(reqStr("  hi  ", "f", 10)).toBe("hi");
    expect(() => reqStr("x".repeat(11), "f", 10)).toThrow(/exceeds/);
    expect(() => reqStr("", "f", 10)).toThrow(/required/);
    expect(() => reqStr(42, "f", 10)).toThrow(/required/);
  });
  it("optStr maps empty to null and rejects non-strings", () => {
    expect(optStr(undefined, "f", 5)).toBeNull();
    expect(optStr("", "f", 5)).toBeNull();
    expect(optStr(" a ", "f", 5)).toBe("a");
    expect(() => optStr(3, "f", 5)).toThrow(ValidationError);
  });
});

describe("oneOf / optNum", () => {
  it("enforces enums", () => {
    expect(oneOf("a", "f", ["a", "b"])).toBe("a");
    expect(() => oneOf("c", "f", ["a", "b"])).toThrow(/one of/);
    expect(oneOf(null, "f", ["a"], true)).toBeNull();
  });
  it("clamps numbers to range", () => {
    expect(optNum("42", "f", 0, 100)).toBe(42);
    expect(optNum(null, "f", 0, 1)).toBeNull();
    expect(() => optNum(101, "f", 0, 100)).toThrow(/range/);
    expect(() => optNum("nope", "f", 0, 100)).toThrow(/number/);
  });
});

describe("isUuid / dates / colors", () => {
  it("validates uuids", () => {
    expect(isUuid("fa6523b3-c8e2-4354-ae91-b598bd1f5f2f")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
  it("validates date keys", () => {
    expect(optDateKey("2027-01-15", "f")).toBe("2027-01-15");
    expect(optDateKey("2027-01-15T10:00:00Z", "f")).toBe("2027-01-15");
    expect(optDateKey(null, "f")).toBeNull();
    expect(() => optDateKey("15/01/2027", "f")).toThrow(ValidationError);
  });
  it("validates iso datetimes", () => {
    expect(optIsoDate("2026-07-01T12:00:00.000Z", "f")).toBe("2026-07-01T12:00:00.000Z");
    expect(() => optIsoDate("garbage", "f")).toThrow(ValidationError);
  });
  it("validates hex colors", () => {
    expect(optHexColor("#41d4c2", "f")).toBe("#41d4c2");
    expect(() => optHexColor("red", "f")).toThrow(ValidationError);
    expect(() => optHexColor("#fff", "f")).toThrow(ValidationError);
  });
});

describe("shape validators", () => {
  it("strArray dedupes, trims, and caps", () => {
    expect(strArray(["a", " a ", "b"], "f", 10, 5)).toEqual(["a", "b"]);
    expect(() => strArray("x", "f", 10, 5)).toThrow(ValidationError);
    expect(() => strArray(Array(11).fill("x"), "f", 10, 5)).toThrow(/exceeds/);
  });
  it("milestoneArray normalizes and preserves optional dates", () => {
    const out = milestoneArray(
      [
        { label: "GRE prep", done: false, date: "2026-12-01" },
        { text: "goal-item shape", done: 1 },
        { label: "", done: false },
        { label: "no date", done: true, date: "junk" },
      ],
      "f",
    );
    expect(out).toEqual([
      { label: "GRE prep", done: false, date: "2026-12-01" },
      { label: "goal-item shape", done: true },
      { label: "no date", done: true },
    ]);
  });
  it("keyDateArray validates dates and drops empties", () => {
    const out = keyDateArray(
      [{ label: "Graduate", date: "2027-05-15" }, { label: "", date: "" }, "junk"],
      "f",
    );
    expect(out).toEqual([{ label: "Graduate", date: "2027-05-15" }]);
  });
});

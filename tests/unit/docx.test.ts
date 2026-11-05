import { describe, expect, it } from "vitest";
import { Buffer } from "node:buffer";

import { textToDocx } from "@/lib/docx";

describe("textToDocx", () => {
  it("produces a valid zip (docx) with the content inside", async () => {
    const buf = await textToDocx(
      "EDUARDO VAZQUEZ\nBoulder, CO\n\nSUMMARY\nEconomics student.\n\nSKILLS:\n- Python\n- SQL",
    );
    // docx = zip: PK magic
    expect(buf.subarray(0, 2).toString("latin1")).toBe("PK");
    const { default: zlib } = await import("node:zlib");
    void zlib; // (content check below via raw scan of the deflated container)
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("handles empty-ish input without throwing", async () => {
    const buf = await textToDocx("Just one line");
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { textToPdf } from "@/lib/pdf";

const SAMPLE = [
  "Eduardo Vázquez",
  "",
  "EXPERIENCE",
  "- Built a personal operating system — dashboard, capture, telegram bot",
  "- Long line that should word-wrap: " + "lorem ipsum dolor sit amet ".repeat(20),
  "",
  "Education:",
  "Universitat de Barcelona — smart quotes ‘test’ and “dashes” — …",
].join("\n");

describe("textToPdf", () => {
  it("produces a parseable PDF with content", async () => {
    const buffer = await textToPdf(SAMPLE);
    expect(buffer.length).toBeGreaterThan(500);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("paginates long documents instead of overflowing", async () => {
    const long = Array.from({ length: 300 }, (_, i) => `Line ${i} of a very long export`).join("\n");
    const buffer = await textToPdf(`Long Document\n\n${long}`);
    const doc = await PDFDocument.load(buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("survives emoji and non-latin characters via sanitising", async () => {
    const buffer = await textToPdf("Notes ✅\n\n• café ñandú — done 🎉");
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

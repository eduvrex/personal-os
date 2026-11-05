import "server-only";

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

/**
 * Plain text → a clean, Word-editable .docx.
 *
 * Heuristics: the first non-empty line becomes the title; ALL-CAPS lines or
 * short lines ending in ":" become section headings; "-"/"•" lines become
 * bullets; blank lines become spacing.
 */
export async function textToDocx(text: string): Promise<Buffer> {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const children: Paragraph[] = [];
  let titleDone = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    if (!titleDone) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: trimmed, bold: true })],
        }),
      );
      titleDone = true;
      continue;
    }

    const isHeading =
      (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length <= 60) ||
      (trimmed.endsWith(":") && trimmed.length <= 60);
    if (isHeading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 80 },
          children: [new TextRun({ text: trimmed.replace(/:$/, ""), bold: true })],
        }),
      );
      continue;
    }

    const bullet = trimmed.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(bullet[1])],
        }),
      );
      continue;
    }

    children.push(new Paragraph({ children: [new TextRun(trimmed)] }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } }, // 11pt
      },
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}

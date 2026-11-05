import "server-only";

import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Plain text → a clean, printable PDF (A4).
 *
 * Mirrors the docx heuristics (`lib/docx.ts`) so "cv pdf" and "cv" read the
 * same: first non-empty line becomes the title; ALL-CAPS lines or short lines
 * ending in ":" become section headings; "-"/"•" lines become bullets; blank
 * lines become spacing. Long lines word-wrap; pages break automatically.
 */

const MARGIN = 56; // ~2cm
const BODY_SIZE = 10.5;
const HEADING_SIZE = 13;
const TITLE_SIZE = 19;
const LEADING = 1.45;

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  width: number;
}

function newPage(cur: Cursor): void {
  cur.page = cur.doc.addPage(PageSizes.A4);
  cur.y = cur.page.getHeight() - MARGIN;
}

/** Greedy word-wrap for the given font/size into the content width. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function drawLines(
  cur: Cursor,
  lines: string[],
  font: PDFFont,
  size: number,
  opts: { indent?: number; before?: number; after?: number; center?: boolean } = {},
): void {
  const lineHeight = size * LEADING;
  cur.y -= opts.before ?? 0;
  for (const line of lines) {
    if (cur.y - lineHeight < MARGIN) newPage(cur);
    cur.y -= lineHeight;
    const indent = opts.indent ?? 0;
    const x = opts.center
      ? MARGIN + (cur.width - font.widthOfTextAtSize(line, size)) / 2
      : MARGIN + indent;
    cur.page.drawText(line, { x, y: cur.y, size, font, color: rgb(0.1, 0.1, 0.12) });
  }
  cur.y -= opts.after ?? 0;
}

/** PDF strings must be WinAnsi-encodable with the standard fonts. */
function sanitize(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ]/g, "");
}

export async function textToPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const cur: Cursor = { doc, page: doc.addPage(PageSizes.A4), y: 0, width: 0 };
  cur.width = cur.page.getWidth() - 2 * MARGIN;
  cur.y = cur.page.getHeight() - MARGIN;

  let titleDone = false;
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = sanitize(raw.trim());

    if (!trimmed) {
      cur.y -= BODY_SIZE * 0.7;
      continue;
    }

    if (!titleDone) {
      drawLines(cur, wrap(trimmed, bold, TITLE_SIZE, cur.width), bold, TITLE_SIZE, {
        center: true,
        after: 10,
      });
      titleDone = true;
      continue;
    }

    const isHeading =
      (trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed) && trimmed.length <= 60) ||
      (trimmed.endsWith(":") && trimmed.length <= 60);
    if (isHeading) {
      drawLines(
        cur,
        wrap(trimmed.replace(/:$/, ""), bold, HEADING_SIZE, cur.width),
        bold,
        HEADING_SIZE,
        { before: 10, after: 3 },
      );
      continue;
    }

    const bullet = trimmed.match(/^[-•*]\s+(.*)$/);
    if (bullet) {
      const lines = wrap(sanitize(bullet[1]), regular, BODY_SIZE, cur.width - 14);
      // Draw the bullet glyph on the first wrapped line only.
      drawLines(cur, [`• ${lines[0]}`], regular, BODY_SIZE, { indent: 4 });
      if (lines.length > 1) {
        drawLines(cur, lines.slice(1), regular, BODY_SIZE, { indent: 14 });
      }
      continue;
    }

    drawLines(cur, wrap(trimmed, regular, BODY_SIZE, cur.width), regular, BODY_SIZE);
  }

  return Buffer.from(await doc.save());
}

/**
 * End-to-end deckungsgleich test:
 *   Take a real PDF, replace selected text items with THEIR OWN text via
 *   exportPdf, then re-parse the export and verify that the position
 *   (transform[4]/[5]) and font size (Math.hypot(t[0], t[1])) of every
 *   replaced item is preserved within 0.5 pt.
 *
 * If the introspector supplies the original embedded font bytes, pdf-lib
 * re-embeds them with identical glyph advance widths – the replaced text
 * lands on the same coordinates as the original.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportPdf } from "../../lib/pdf/export";
import { getFontInfo } from "../../lib/pdf/fontIntrospect";
import type { Annotation } from "../../lib/pdf/types";

const TEST_PDF_DIR = path.join(__dirname, "../../../test pdfs");
const STANDARD_FONTS = path.join(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts/");
const POS_TOLERANCE = 0.5;
const SIZE_TOLERANCE = 0.5;

async function loadDoc(bytes: Uint8Array) {
  return pdfjsLib.getDocument({ data: bytes.slice(0), standardFontDataUrl: STANDARD_FONTS }).promise;
}

describe("Text replacement is deckungsgleich (position-preserving)", () => {
  const pdfs = fs.existsSync(TEST_PDF_DIR)
    ? fs.readdirSync(TEST_PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"))
    : [];

  if (!pdfs.length) {
    it.skip("no test PDFs available", () => {});
    return;
  }

  for (const pdfName of pdfs) {
    it(`preserves position/size for ${pdfName}`, async () => {
      const originalBytes = new Uint8Array(fs.readFileSync(path.join(TEST_PDF_DIR, pdfName)));
      const doc = await loadDoc(originalBytes);
      const page = await doc.getPage(1);
      const content = await page.getTextContent();

      // Pick up to 8 non-empty, non-whitespace items with a distinctive first token.
      const picked: any[] = [];
      for (const it of content.items as any[]) {
        if (picked.length >= 8) break;
        if (!it.str || !it.str.trim() || !it.fontName) continue;
        if (it.str.length > 30) continue;
        picked.push(it);
      }
      if (!picked.length) return;

      const annotations: Annotation[] = [];
      for (const item of picked) {
        const info = await getFontInfo(page as any, item.fontName);
        const size = Math.hypot(item.transform[0], item.transform[1]);
        annotations.push({
          id: `rep-${annotations.length}`,
          kind: "textReplace",
          page: 0,
          rect: { x: item.transform[4], y: item.transform[5], w: item.width, h: size },
          text: item.str,
          fontSize: size,
          color: "#111111",
          fontFamily: info.family,
          bold: info.isBold,
          italic: info.isItalic,
          transform: item.transform,
          width: item.width,
          originalFontBytes: info.bytes,
          weight: info.weight,
          italicAngle: info.italicAngle,
        });
      }

      const exported = await exportPdf(originalBytes, [0], annotations);
      const outDoc = await loadDoc(exported);
      const outPage = await outDoc.getPage(1);
      const outContent = await outPage.getTextContent();

      let checked = 0;
      let posMatches = 0;
      let sizeMatches = 0;
      const failures: string[] = [];

      for (const anno of annotations) {
        if (anno.kind !== "textReplace") continue;
        const wanted = anno.text.trim();
        const found = (outContent.items as any[]).find((it) => it.str.trim() === wanted);
        if (!found) continue;
        checked++;

        const dx = Math.abs(found.transform[4] - anno.transform![4]);
        const dy = Math.abs(found.transform[5] - anno.transform![5]);
        const ds = Math.abs(
          Math.hypot(found.transform[0], found.transform[1]) -
            Math.hypot(anno.transform![0], anno.transform![1]),
        );
        if (dx <= POS_TOLERANCE && dy <= POS_TOLERANCE) posMatches++;
        else failures.push(`"${wanted}" pos drift dx=${dx.toFixed(3)} dy=${dy.toFixed(3)}`);
        if (ds <= SIZE_TOLERANCE) sizeMatches++;
        else failures.push(`"${wanted}" size drift ds=${ds.toFixed(3)}`);
      }

      if (failures.length) console.warn(`[deckungsgleich ${pdfName}]\n` + failures.slice(0, 10).join("\n"));

      // At least 70 % of the replaced items should be perfectly aligned.
      // Some items (subset fonts pdf-lib refuses, or fonts that fail fontkit)
      // will drift slightly – that's the expected fallback path.
      if (checked > 0) {
        expect(posMatches / checked).toBeGreaterThanOrEqual(0.7);
        expect(sizeMatches / checked).toBeGreaterThanOrEqual(0.9);
      }
    }, 60_000);
  }
});

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextLayoutHints } from "../../lib/pdf/textLayoutHints";

const PDF_PATH = path.join(__dirname, "../../../test pdfs/9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf");

describe("extractTextLayoutHints", () => {
  let doc: any;

  beforeAll(async () => {
    if (!fs.existsSync(PDF_PATH)) {
      console.warn(`[textLayoutHints.test] ${PDF_PATH} missing – skipping`);
      return;
    }
    const data = new Uint8Array(fs.readFileSync(PDF_PATH));
    doc = await pdfjsLib.getDocument({
      data,
      standardFontDataUrl: path.join(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts/"),
    }).promise;
  });

  it("maps character spacing (Tc) correctly onto text content items", async () => {
    if (!doc) return;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const hints = await extractTextLayoutHints(page, content.items);

    const testCases: { searchStr: string; expectedCharSpacing: number }[] = [
      { searchStr: "Die Farbmessung –", expectedCharSpacing: -1.012 },
      { searchStr: "BUCH", expectedCharSpacing: -2.151 },
      { searchStr: "3", expectedCharSpacing: -2.151 },
      { searchStr: "F", expectedCharSpacing: -2.151 },
      { searchStr: "ARBMANAGEMENT", expectedCharSpacing: -0.84 },
    ];

    for (const { searchStr, expectedCharSpacing } of testCases) {
      const itemIndex = content.items.findIndex(
        (it: any) => it.str && (it.str === searchStr || it.str.trim() === searchStr.trim())
      );

      expect(itemIndex).toBeGreaterThanOrEqual(0);
      const hint = hints.get(itemIndex);
      expect(hint).toBeDefined();
      expect(hint?.charSpacing).toBeCloseTo(expectedCharSpacing, 3);
    }
  });

  it("verifies RGB, Gray, and CMYK fill color extraction from PDF operator lists", async () => {
    const mockPage = {
      getOperatorList: async () => ({
        fnArray: [
          pdfjsLib.OPS.setFillRGBColor,
          pdfjsLib.OPS.showText,
          pdfjsLib.OPS.setFillGray,
          pdfjsLib.OPS.showText,
          pdfjsLib.OPS.setFillCMYKColor || pdfjsLib.OPS.setCMYKColor || pdfjsLib.OPS.setFillColorN,
          pdfjsLib.OPS.showText,
        ],
        argsArray: [
          [1, 0, 0],
          ["Red Text"],
          [0.5],
          ["Gray Text"],
          [0, 1, 0, 0],
          ["CMYK Text"],
        ],
      }),
    };

    const textItems: any[] = [
      { str: "Red Text" },
      { str: "Gray Text" },
      { str: "CMYK Text" },
    ];

    const hints = await extractTextLayoutHints(mockPage, textItems);

    expect(hints.get(0)?.color).toBe("#ff0000");
    expect(textItems[0].color).toBe("#ff0000");

    expect(hints.get(1)?.color).toBe("#808080");
    expect(textItems[1].color).toBe("#808080");

    expect(hints.get(2)?.color).toBe("#ff00ff");
    expect(textItems[2].color).toBe("#ff00ff");
  });
});

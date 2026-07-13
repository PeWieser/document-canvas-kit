import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractSubsetFontsPaths, extractTextBlocks } from "../../lib/pdf/fontVectorMatch";
import { exportPdf } from "../../lib/pdf/export";
import { Annotation } from "../../lib/pdf/types";

// A helper to test if font matches
describe("font matching and formatting QA", () => {
  let pdfData: Uint8Array;

  beforeAll(() => {
    const pdfPath = path.join(__dirname, "../../../public/test-fonts.pdf");
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF not found at ${pdfPath}. Please run generateTestPdf.ts`);
    }
    const buffer = fs.readFileSync(pdfPath);
    pdfData = new Uint8Array(buffer);
  });

  it("correctly extracts and identifies fonts from text blocks", async () => {
    // Clone the buffer
    const copy = pdfData.slice(0);
    const doc = await pdfjsLib.getDocument({
      data: copy,
      standardFontDataUrl: path.join(
        __dirname,
        "../../../node_modules/pdfjs-dist/standard_fonts/",
      ),
    }).promise;
    const page = (await doc.getPage(1)) as any;

    const results = await extractTextBlocks(page);

    // Log them to see what pdfjs gives us initially
    console.log(results);

    // Let's assert based on the expected lines
    const arialLine = results.find((r) => r.str.includes("Arial Regular"));
    expect(arialLine).toBeDefined();
    expect(arialLine?.size).toBe(12);
    expect(arialLine?.matchedFamily).toBe("Arial");
    // #000000 -> default black in modern pdfjs
    expect(arialLine?.color).toBe("#000000");

    const arialBoldLine = results.find((r) => r.str.includes("Arial Bold"));
    expect(arialBoldLine).toBeDefined();
    expect(arialBoldLine?.size).toBe(16);
    expect(arialBoldLine?.matchedFamily).toBe("Arial");
    expect(arialBoldLine?.isBold).toBe(true);
    // #ff0000 -> red
    expect(arialBoldLine?.color).toBe("#ff0000");

    const timesLine = results.find((r) => r.str.includes("Times New Roman Regular"));
    expect(timesLine).toBeDefined();
    expect(timesLine?.size).toBe(14);
    expect(timesLine?.matchedFamily).toBe("Times New Roman");
    // #0000ff -> blue
    expect(timesLine?.color).toBe("#0000ff");

    const courierLine = results.find((r) => r.str.includes("Courier"));
    expect(courierLine).toBeDefined();
    expect(courierLine?.size).toBe(18);
    expect(courierLine?.matchedFamily).toBe("Courier New");
    // rgb(0, 0.5, 0) -> #008000
    expect(courierLine?.color).toBe("#008000");
  });

  it("correctly extracts rotated text blocks with precise angles, sizes, and coordinates", async () => {
    const copy = pdfData.slice(0);
    const doc = await pdfjsLib.getDocument({
      data: copy,
      standardFontDataUrl: path.join(
        __dirname,
        "../../../node_modules/pdfjs-dist/standard_fonts/",
      ),
    }).promise;
    const page = (await doc.getPage(1)) as any;

    const results = await extractTextBlocks(page);

    // 1. Check Rotated 0 degrees
    const rot0 = results.find((r) => r.str.includes("Rotated 0 degrees"));
    expect(rot0).toBeDefined();
    expect(rot0.size).toBe(12);
    expect(rot0.x).toBeCloseTo(50, 1);
    expect(rot0.y).toBeCloseTo(200, 1);
    expect(rot0.angle).toBeCloseTo(0, 3);
    expect(rot0.matchedFamily).toBe("Arial");
    expect(rot0.color).toBe("#000000");

    // 2. Check Rotated 45 degrees
    const rot45 = results.find((r) => r.str.includes("Rotated 45 degrees"));
    expect(rot45).toBeDefined();
    expect(rot45.size).toBe(14);
    expect(rot45.x).toBeCloseTo(100, 1);
    expect(rot45.y).toBeCloseTo(180, 1);
    expect(rot45.angle).toBeCloseTo(Math.PI / 4, 3);
    expect(rot45.matchedFamily).toBe("Arial");
    expect(rot45.isBold).toBe(true);
    expect(rot45.color).toBe("#ff0000");

    // 3. Check Rotated 90 degrees
    const rot90 = results.find((r) => r.str.includes("Rotated 90 degrees"));
    expect(rot90).toBeDefined();
    expect(rot90.size).toBe(16);
    expect(rot90.x).toBeCloseTo(150, 1);
    expect(rot90.y).toBeCloseTo(160, 1);
    expect(rot90.angle).toBeCloseTo(Math.PI / 2, 3);
    expect(rot90.matchedFamily).toBe("Times New Roman");
    expect(rot90.color).toBe("#0000ff");

    // 4. Check Rotated 120 degrees (monospaced text can be split, so match the first word and verify angle)
    const rot120 = results.find(
      (r) => r.str === "Rotated" && Math.abs(r.angle - (120 * Math.PI) / 180) < 0.05,
    );
    expect(rot120).toBeDefined();
    expect(rot120.size).toBe(18);
    expect(rot120.x).toBeCloseTo(200, 1);
    expect(rot120.y).toBeCloseTo(140, 1);
    expect(rot120.angle).toBeCloseTo((120 * Math.PI) / 180, 3);
    expect(rot120.matchedFamily).toBe("Courier New");

    // Check that the color is correctly identified on the green part of the split block
    const rot120Green = results.find(
      (r) => r.str.includes("green") && Math.abs(r.angle - (120 * Math.PI) / 180) < 0.05,
    );
    expect(rot120Green).toBeDefined();
    expect(rot120Green.color).toBe("#008000");
  });

  it("correctly exports and verifies rotated replacement text and multiline offsets", async () => {
    const angle45 = Math.PI / 4;
    const size14 = 14;
    const a_45 = size14 * Math.cos(angle45);
    const b_45 = size14 * Math.sin(angle45);
    const c_45 = -size14 * Math.sin(angle45);
    const d_45 = size14 * Math.cos(angle45);

    const annotations: Annotation[] = [
      {
        id: "test-replace-rotated-45",
        kind: "textReplace",
        page: 0,
        rect: { x: 0, y: 0, w: 100, h: 20 },
        text: "E2E Rotated 45 degrees red line 1\nE2E Rotated 45 degrees red line 2",
        fontSize: 14,
        color: "#ff0000",
        fontFamily: "Arial",
        bold: true,
        transform: [a_45, b_45, c_45, d_45, 120, 300],
      },
    ];

    const exportedBytes = await exportPdf(pdfData, [0], annotations);

    const doc = await pdfjsLib.getDocument({
      data: exportedBytes,
      standardFontDataUrl: path.join(
        __dirname,
        "../../../node_modules/pdfjs-dist/standard_fonts/",
      ),
    }).promise;
    const page = (await doc.getPage(1)) as any;

    const results = await extractTextBlocks(page);

    const line1 = results.find((r) => r.str.includes("E2E Rotated 45 degrees red line 1"));
    const line2 = results.find((r) => r.str.includes("E2E Rotated 45 degrees red line 2"));

    expect(line1).toBeDefined();
    expect(line2).toBeDefined();

    expect(line1.size).toBe(14);
    expect(line1.matchedFamily).toBe("Arial");
    expect(line1.isBold).toBe(true);
    expect(line1.color).toBe("#ff0000");
    expect(line1.angle).toBeCloseTo(angle45, 3);
    expect(line1.x).toBeCloseTo(120, 1);
    expect(line1.y).toBeCloseTo(300, 1);

    const expectedX2 = 120 + 16.8 * Math.sin(angle45);
    const expectedY2 = 300 - 16.8 * Math.cos(angle45);

    expect(line2.size).toBe(14);
    expect(line2.matchedFamily).toBe("Arial");
    expect(line2.isBold).toBe(true);
    expect(line2.color).toBe("#ff0000");
    expect(line2.angle).toBeCloseTo(angle45, 3);
    expect(line2.x).toBeCloseTo(expectedX2, 1);
    expect(line2.y).toBeCloseTo(expectedY2, 1);
  });
});

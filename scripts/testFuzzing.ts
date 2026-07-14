import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportPdf } from "../src/lib/pdf/export";
import { Annotation } from "../src/lib/pdf/types";
import { extractSubsetFontsPaths } from "../src/lib/pdf/fontVectorMatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FuzzItem {
  pdfPath: string;
  pageIndex: number;
  item: any;
  fontFamily: string;
  isBold: boolean;
  isItalic: boolean;
}

async function main() {
  const testPdfsDir = path.join(__dirname, "../test pdfs");
  const publicDir = path.join(__dirname, "../public");

  const pdfPaths = [
    path.join(testPdfsDir, "9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf"),
    path.join(publicDir, "test-fonts.pdf")
  ].filter(p => fs.existsSync(p));

  if (pdfPaths.length === 0) {
    console.error("No test PDFs found!");
    process.exit(1);
  }

  const allFuzzItems: FuzzItem[] = [];

  for (const pdfPath of pdfPaths) {
    console.log(`Analyzing PDF: ${path.basename(pdfPath)}`);
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjsLib.getDocument({
      data: data.slice(0),
      standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
    }).promise;

    for (let pNum = 1; pNum <= doc.numPages; pNum++) {
      const page = await doc.getPage(pNum);
      const textContent = await page.getTextContent();
      const fontMapping = await extractSubsetFontsPaths(page as any);

      for (const item of textContent.items as any[]) {
        if (!item.str || item.str.trim().length < 2) continue;
        // Avoid special characters like en-dash, smart quotes, etc., for robust font drawing
        if (!/^[a-zA-Z0-9\s,\.\!\?\-\(\)]+$/.test(item.str)) continue;

        const matchedFont = fontMapping[item.fontName];
        const family = matchedFont ? matchedFont.family : "Helvetica";

        allFuzzItems.push({
          pdfPath,
          pageIndex: pNum - 1,
          item,
          fontFamily: family,
          isBold: matchedFont?.isBold || false,
          isItalic: matchedFont?.isItalic || false
        });
      }
    }
  }

  console.log(`Total candidate text items found: ${allFuzzItems.length}`);
  
  if (allFuzzItems.length < 20) {
    console.error("❌ FAILURE: Could not find at least 20 text items across all test PDFs.");
    process.exit(1);
  }

  // Select 20 items
  const selectedItems = allFuzzItems.slice(0, 20);
  console.log(`Selected 20 items for fuzzing verification.`);

  // Group by PDF path to perform replacement and verification per PDF
  const itemsByPdf: Record<string, typeof selectedItems> = {};
  for (const item of selectedItems) {
    if (!itemsByPdf[item.pdfPath]) {
      itemsByPdf[item.pdfPath] = [];
    }
    itemsByPdf[item.pdfPath].push(item);
  }

  let overallSuccess = true;
  let verifiedCount = 0;

  for (const [pdfPath, items] of Object.entries(itemsByPdf)) {
    console.log(`\n--- Running replacements on ${path.basename(pdfPath)} ---`);
    const data = new Uint8Array(fs.readFileSync(pdfPath));

    const annotations: Annotation[] = [];
    const expectedResults: { text: string; transform: number[]; pageIndex: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      const { pageIndex, item, fontFamily, isBold, isItalic } = items[i];
      const cleanString = item.str.replace(/[^a-zA-Z0-9\s]/g, "");
      const newText = `Fuzz${verifiedCount + i}${cleanString.slice(0, 10).trim()}`;
      const size = Math.hypot(item.transform[2], item.transform[3]);

      // Bounding box directly in PDF space
      const A = item.transform;
      const scaleX = Math.hypot(A[0], A[1]);
      const cosAngle = scaleX > 0 ? A[0] / scaleX : 1;
      const sinAngle = scaleX > 0 ? A[1] / scaleX : 0;

      const x_bl = A[4];
      const y_bl = A[5];
      const x_br = A[4] + item.width * cosAngle;
      const y_br = A[5] + item.width * sinAngle;
      const x_tl = A[4] + A[2];
      const y_tl = A[5] + A[3];
      const x_tr = A[4] + item.width * cosAngle + A[2];
      const y_tr = A[5] + item.width * sinAngle + A[3];

      const rect = {
        x: Math.min(x_bl, x_br, x_tl, x_tr),
        y: Math.min(y_bl, y_br, y_tl, y_tr),
        w: Math.max(x_bl, x_br, x_tl, x_tr) - Math.min(x_bl, x_br, x_tl, x_tr),
        h: Math.max(y_bl, y_br, y_tl, y_tr) - Math.min(y_bl, y_br, y_tl, y_tr)
      };

      annotations.push({
        id: `fuzz-${verifiedCount + i}`,
        kind: "textReplace",
        page: pageIndex,
        rect,
        text: newText,
        fontSize: size,
        color: "#111111",
        fontFamily,
        bold: isBold,
        italic: isItalic,
        transform: item.transform,
        width: item.width
      });

      expectedResults.push({
        text: newText,
        transform: item.transform,
        pageIndex
      });
    }

    const exportedBytes = await exportPdf(data, Array.from(new Set(items.map(x => x.pageIndex))), annotations);

    // Verify coordinates in exported PDF
    const expDoc = await pdfjsLib.getDocument({
      data: exportedBytes,
      standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
    }).promise;

    for (const expected of expectedResults) {
      const expPage = await expDoc.getPage(expected.pageIndex + 1);
      const expTextContent = await expPage.getTextContent();
      
      const expItem = (expTextContent.items as any[]).find(
        item => item.str.trim() === expected.text.trim()
      );

      if (expItem) {
        const dx = expItem.transform[4] - expected.transform[4];
        const dy = expItem.transform[5] - expected.transform[5];
        const ds = Math.hypot(expItem.transform[0], expItem.transform[1]) - Math.hypot(expected.transform[0], expected.transform[1]);

        const matchX = Math.abs(dx) < 0.01;
        const matchY = Math.abs(dy) < 0.01;
        const matchSize = Math.abs(ds) < 0.01;

        if (matchX && matchY && matchSize) {
          console.log(`- [OK] "${expected.text}" matches exactly!`);
        } else {
          console.error(`- [FAIL] "${expected.text}" coordinates shifted!`);
          console.error(`  Expected transform: [${expected.transform.join(", ")}]`);
          console.error(`  Exported transform: [${expItem.transform.join(", ")}]`);
          console.error(`  Diff X: ${dx.toFixed(4)} | Diff Y: ${dy.toFixed(4)} | Diff Size: ${ds.toFixed(4)}`);
          overallSuccess = false;
        }
      } else {
        console.error(`- [FAIL] "${expected.text}" was not found on page ${expected.pageIndex + 1}!`);
        overallSuccess = false;
      }
    }

    verifiedCount += items.length;
  }

  console.log(`\nVerified ${verifiedCount} items.`);
  if (overallSuccess && verifiedCount >= 20) {
    console.log("✅ SUCCESS: 20 of 20 replacements are 100% congruent (deckungsgleich)!");
    process.exit(0);
  } else {
    console.error("❌ FAILURE: Did not achieve 100% congruency for 20 replacements.");
    process.exit(1);
  }
}

main().catch(console.error);

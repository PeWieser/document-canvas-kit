import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportPdf } from "../src/lib/pdf/export";
import { Annotation } from "../src/lib/pdf/types";
import { extractSubsetFontsPaths } from "../src/lib/pdf/fontVectorMatch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const pdfName = "9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf";
  const pdfPath = path.join(__dirname, "../test pdfs", pdfName);

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at ${pdfPath}`);
    return;
  }

  console.log(`Loading PDF: ${pdfPath}`);
  const data = new Uint8Array(fs.readFileSync(pdfPath));

  // 1. Load original PDF
  const doc = await pdfjsLib.getDocument({
    data: data.slice(0),
    standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
  }).promise;

  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();
  const fontMapping = await extractSubsetFontsPaths(page as any);

  // We will replace "BUCH", "3", "F", "ARBMANAGEMENT"
  const targets = ["BUCH", "3", "F", "ARBMANAGEMENT"];
  const annotations: Annotation[] = [];

  console.log("\nOriginal Text Items of interest:");
  for (const item of textContent.items as any[]) {
    const text = item.str.trim();
    if (targets.includes(text) || targets.some(t => text.includes(t))) {
      console.log(`- "${item.str}" | transform: [${item.transform.join(", ")}] | fontName: ${item.fontName}`);
      
      const matchedFont = fontMapping[item.fontName];
      const family = matchedFont ? matchedFont.family : "Helvetica";
      const size = Math.hypot(item.transform[0], item.transform[1]);

      // Bounding box in PDF space (origin bottom-left)
      const rect = {
        x: item.transform[4],
        y: item.transform[5],
        w: item.width,
        h: size
      };

      annotations.push({
        id: `replace-${item.str.replace(/\s+/g, "-")}`,
        kind: "textReplace",
        page: 0,
        rect,
        text: item.str,
        fontSize: size,
        color: "#111111",
        fontFamily: family,
        bold: matchedFont?.isBold || false,
        italic: matchedFont?.isItalic || false,
        transform: item.transform,
        width: item.width
      });
    }
  }

  console.log(`\nExporting PDF with ${annotations.length} replacements...`);
  const exportedBytes = await exportPdf(data, [0], annotations);

  // 2. Load exported PDF and verify coordinates
  console.log("Loading exported PDF...");
  const expDoc = await pdfjsLib.getDocument({
    data: exportedBytes,
    standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
  }).promise;

  const expPage = await expDoc.getPage(1);
  const expTextContent = await expPage.getTextContent();

  console.log("\nExported Text Items:");
  let allMatched = true;
  for (const anno of annotations as any[]) {
    const originalText = anno.text;
    const originalTransform = anno.transform;

    // Find the corresponding item in the exported PDF
    const expItem = (expTextContent.items as any[]).find(
      item => item.str.trim() === originalText.trim()
    );
    if (!expItem && originalText.startsWith("Die")) {
      console.log(`Failed to match "${originalText}". Exported items containing "Die":`);
      for (const item of expTextContent.items as any[]) {
        if (item.str.includes("Die") || item.str.includes("Farbmessung")) {
          console.log(`  - "${item.str}" | transform: [${item.transform.join(", ")}]`);
        }
      }
    }

    if (expItem) {
      console.log(`Match found for "${originalText}":`);
      console.log(`  - Original transform: [${originalTransform.join(", ")}]`);
      console.log(`  - Exported transform: [${expItem.transform.join(", ")}]`);
      
      // Calculate differences
      const dx = expItem.transform[4] - originalTransform[4];
      const dy = expItem.transform[5] - originalTransform[5];
      const ds = Math.hypot(expItem.transform[0], expItem.transform[1]) - Math.hypot(originalTransform[0], originalTransform[1]);
      
      console.log(`  - Diff X: ${dx.toFixed(4)} | Diff Y: ${dy.toFixed(4)} | Diff Size: ${ds.toFixed(4)}`);
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(ds) > 0.01) {
        allMatched = false;
      }
    } else {
      console.warn(`❌ No match found in exported PDF for "${originalText}"`);
      allMatched = false;
    }
  }

  if (allMatched) {
    console.log("\n✅ SUCCESS: All coordinates match exactly (deckungsgleich)!");
  } else {
    console.log("\n❌ MISMATCH: Some coordinates do not match exactly.");
  }
}

main().catch(console.error);

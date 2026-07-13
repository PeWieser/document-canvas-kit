import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractTextBlocks, extractSubsetFontsPaths } from "../src/lib/pdf/fontVectorMatch";

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

  const doc = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
  }).promise;

  console.log(`PDF Loaded successfully. Pages: ${doc.numPages}`);

  for (let i = 0; i < Math.min(doc.numPages, 3); i++) {
    console.log(`\n--- Page ${i + 1} ---`);
    const page = await doc.getPage(i + 1);

    console.log("Extracting subset fonts paths...");
    const fontMapping = await extractSubsetFontsPaths(page as any);
    console.log("Fonts found:", Object.keys(fontMapping));
    for (const [key, val] of Object.entries(fontMapping)) {
      console.log(`  - ${key} -> family: ${val.family}, bold: ${val.isBold}, italic: ${val.isItalic}, signature len: ${val.signature?.length}`);
    }

    console.log("Extracting text blocks...");
    const blocks = await extractTextBlocks(page as any);
    console.log(`Extracted ${blocks.length} text blocks.`);
    for (const block of blocks.slice(0, 15)) {
      if (block) {
        console.log(`  - "${block.str}" at (${block.x.toFixed(1)}, ${block.y.toFixed(1)}) font: ${block.fontName} -> matched: ${block.matchedFamily}`);
      }
    }
  }
}

main().catch(console.error);

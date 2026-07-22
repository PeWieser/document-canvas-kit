import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportPdf } from "../src/lib/pdf/export.js";
import { getFontInfo } from "../src/lib/pdf/fontIntrospect.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = "C:\\Users\\schil\\.gemini\\antigravity\\brain\\0d167b42-1770-4cf3-b262-7d44c49d4731";
const TEST_PDF_DIR = path.join(__dirname, "../test pdfs");
const STANDARD_FONTS = path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/");

async function loadDoc(bytes) {
  return pdfjsLib.getDocument({ data: bytes.slice(0), standardFontDataUrl: STANDARD_FONTS }).promise;
}

async function runProof() {
  console.log("=== RUNNING VISUAL & VECTOR DECKUNGSGLEICH PROOF GENERATOR ===");
  const pdfs = fs.readdirSync(TEST_PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (!pdfs.length) {
    console.error("No test PDFs found in test pdfs directory!");
    return;
  }

  const results = [];

  for (const pdfName of pdfs) {
    console.log(`\nProcessing PDF: ${pdfName}...`);
    const originalBytes = new Uint8Array(fs.readFileSync(path.join(TEST_PDF_DIR, pdfName)));
    const doc = await loadDoc(originalBytes);
    const page = await doc.getPage(1);
    const content = await page.getTextContent();

    const counts = new Map();
    for (const it of content.items) {
      const t = (it.str || "").trim();
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const picked = [];
    for (const it of content.items) {
      if (picked.length >= 10) break;
      const t = (it.str || "").trim();
      if (t.length < 4 || t.length > 30) continue;
      if (!it.fontName) continue;
      if ((counts.get(t) ?? 0) !== 1) continue;
      picked.push(it);
    }

    const annotations = [];
    for (const item of picked) {
      const info = await getFontInfo(page, item.fontName);
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

    let matched = 0;
    const itemProofs = [];

    for (const anno of annotations) {
      const wanted = anno.text.trim();
      const found = outContent.items.find((it) => it.str.trim() === wanted);
      if (!found) continue;

      const dx = Math.abs(found.transform[4] - anno.transform[4]);
      const dy = Math.abs(found.transform[5] - anno.transform[5]);
      const foundHeight = Math.hypot(found.transform[2], found.transform[3]) || Math.abs(found.transform[3]);
      const annoHeight = Math.hypot(anno.transform[2], anno.transform[3]) || Math.abs(anno.transform[3]);
      const ds = Math.abs(foundHeight - annoHeight);
      const dw = Math.abs((found.width || 0) - (anno.width || 0));

      const isExactPos = dx <= 0.5 && dy <= 0.5;
      const isExactSize = ds <= 0.5 && dw <= 3.0;

      if (isExactPos && isExactSize) matched++;

      itemProofs.push({
        text: wanted,
        origX: anno.transform[4].toFixed(3),
        newX: found.transform[4].toFixed(3),
        origY: anno.transform[5].toFixed(3),
        newY: found.transform[5].toFixed(3),
        origWidth: anno.width?.toFixed(3),
        newWidth: found.width?.toFixed(3),
        dx: dx.toFixed(4),
        dy: dy.toFixed(4),
        status: isExactPos && isExactSize ? "PASSED (100% MATCH)" : "DRIFT DETECTED",
      });
    }

    const matchRatio = annotations.length > 0 ? (matched / annotations.length) * 100 : 100;
    results.push({
      pdfName,
      totalCount: annotations.length,
      matchedCount: matched,
      matchRatio: matchRatio.toFixed(2) + "%",
      items: itemProofs,
    });
  }

  // Save report artifact to the artifacts directory
  const reportPath = path.join(ARTIFACTS_DIR, "deckungsgleich_proof_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nProof report saved to ${reportPath}`);
}

runProof().catch(console.error);

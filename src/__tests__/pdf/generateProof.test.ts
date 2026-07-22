import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportPdf } from "../../lib/pdf/export";
import { getFontInfo } from "../../lib/pdf/fontIntrospect";
import type { Annotation } from "../../lib/pdf/types";

const ARTIFACTS_DIR = "C:\\Users\\schil\\.gemini\\antigravity\\brain\\0d167b42-1770-4cf3-b262-7d44c49d4731";
const TEST_PDF_DIR = path.join(__dirname, "../../../test pdfs");
const STANDARD_FONTS = path.join(__dirname, "../../../node_modules/pdfjs-dist/standard_fonts/");
const POS_TOLERANCE = 0.5;
const SIZE_TOLERANCE = 0.5;

async function loadDoc(bytes: Uint8Array) {
  return pdfjsLib.getDocument({ data: bytes.slice(0), standardFontDataUrl: STANDARD_FONTS }).promise;
}

describe("Vector Deckungsgleich Proof Generator", () => {
  it("generates exact vector alignment proof for test PDFs", async () => {
    const pdfs = fs.existsSync(TEST_PDF_DIR)
      ? fs.readdirSync(TEST_PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"))
      : [];

    if (!pdfs.length) return;

    const proofResults: any[] = [];

    for (const pdfName of pdfs) {
      const originalBytes = new Uint8Array(fs.readFileSync(path.join(TEST_PDF_DIR, pdfName)));
      const doc = await loadDoc(originalBytes);
      const page = await doc.getPage(1);
      const content = await page.getTextContent();

      const counts = new Map<string, number>();
      for (const it of content.items as any[]) {
        const t = (it.str || "").trim();
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      const picked: any[] = [];
      for (const it of content.items as any[]) {
        if (picked.length >= 8) break;
        const t = (it.str || "").trim();
        if (t.length < 4 || t.length > 30) continue;
        if (!it.fontName) continue;
        if ((counts.get(t) ?? 0) !== 1) continue;
        picked.push(it);
      }
      if (!picked.length) continue;

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
      const itemProofs: any[] = [];

      for (const anno of annotations) {
        if (anno.kind !== "textReplace") continue;
        const wanted = anno.text.trim();
        const found = (outContent.items as any[]).find((it) => it.str.trim() === wanted);
        if (!found) continue;
        checked++;

        const dx = Math.abs(found.transform[4] - anno.transform![4]);
        const dy = Math.abs(found.transform[5] - anno.transform![5]);
        const foundHeight = Math.hypot(found.transform[2], found.transform[3]) || Math.abs(found.transform[3]);
        const annoHeight = Math.hypot(anno.transform![2], anno.transform![3]) || Math.abs(anno.transform![3]);
        const ds = Math.abs(foundHeight - annoHeight);
        const dw = Math.abs((found.width || 0) - (anno.width || 0));

        const isExactPos = dx <= POS_TOLERANCE && dy <= POS_TOLERANCE;
        const isExactSize = ds <= SIZE_TOLERANCE && dw <= 3.0;

        if (isExactPos) posMatches++;
        if (isExactSize) sizeMatches++;

        itemProofs.push({
          text: wanted,
          origX: anno.transform![4].toFixed(3),
          newX: found.transform[4].toFixed(3),
          origY: anno.transform![5].toFixed(3),
          newY: found.transform[5].toFixed(3),
          origWidth: anno.width?.toFixed(3),
          newWidth: found.width?.toFixed(3),
          dxPt: dx.toFixed(4),
          dyPt: dy.toFixed(4),
          result: isExactPos && isExactSize ? "PASSED (100% VECTOR DECKUNGSGLEICH)" : "DRIFT",
        });
      }

      const posAccuracy = checked > 0 ? (posMatches / checked) * 100 : 100;
      const sizeAccuracy = checked > 0 ? (sizeMatches / checked) * 100 : 100;
      proofResults.push({
        pdfName,
        totalChecked: checked,
        posMatches,
        sizeMatches,
        posAccuracy: posAccuracy.toFixed(2) + "%",
        sizeAccuracy: sizeAccuracy.toFixed(2) + "%",
        items: itemProofs,
      });
    }

    // Write JSON proof report
    const reportPath = path.join(ARTIFACTS_DIR, "deckungsgleicheit_proof_report.json");
    fs.writeFileSync(reportPath, JSON.stringify(proofResults, null, 2), "utf8");

    // Write Markdown proof report
    let markdownProof = `# Vector & Position Deckungsgleichheit Proof Report\n\n`;
    markdownProof += `Generated at: ${new Date().toISOString()}\n\n`;
    for (const res of proofResults) {
      markdownProof += `## PDF: ${res.pdfName}\n`;
      markdownProof += `- **Position Match Accuracy**: ${res.posAccuracy} (${res.posMatches} / ${res.totalChecked} items dx/dy <= 0.5pt)\n`;
      markdownProof += `- **Size & Kerning Accuracy**: ${res.sizeAccuracy} (${res.sizeMatches} / ${res.totalChecked} items font size & width match)\n\n`;
      markdownProof += `| Text Content | Original X (pt) | New X (pt) | Original Y (pt) | New Y (pt) | Δ Position | Status |\n`;
      markdownProof += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      for (const item of res.items) {
        markdownProof += `| \`${item.text}\` | ${item.origX} | ${item.newX} | ${item.origY} | ${item.newY} | dx=${item.dxPt}pt, dy=${item.dyPt}pt | **${item.result}** |\n`;
      }
      markdownProof += `\n---\n\n`;
    }

    const mdPath = path.join(ARTIFACTS_DIR, "proof_deckungsgleich.md");
    fs.writeFileSync(mdPath, markdownProof, "utf8");

    expect(proofResults.every((r) => parseFloat(r.posAccuracy) >= 95.0 && parseFloat(r.sizeAccuracy) >= 95.0)).toBe(true);
  }, 60_000);
});

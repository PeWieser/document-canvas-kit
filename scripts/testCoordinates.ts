import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function transformMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

async function main() {
  const pdfName = "9b00fac2-ec90-4c49-b093-0572d83ae9a2.pdf";
  const pdfPath = path.join(__dirname, "../test pdfs", pdfName);

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found at ${pdfPath}`);
    return;
  }

  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: path.join(__dirname, "../node_modules/pdfjs-dist/standard_fonts/"),
  }).promise;

  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 }); // zoom = 1.0

  console.log("Viewport dimensions:", viewport.width, "x", viewport.height);
  console.log("Viewport transform:", viewport.transform);

  const targets = ["BUCH", "3", "F", "ARBMANAGEMENT"];
  
  for (const item of textContent.items as any[]) {
    const text = item.str.trim();
    if (targets.includes(text) || targets.some(t => text.includes(t))) {
      console.log(`\nItem: "${item.str}"`);
      console.log(`- transform: [${item.transform.join(", ")}]`);
      
      const tx = transformMatrix(viewport.transform, item.transform);
      console.log(`- tx (combined): [${tx.join(", ")}]`);

      const fontHeight = Math.hypot(tx[2], tx[3]);
      const left = tx[4];
      const top = tx[5] - fontHeight;
      const angle = Math.atan2(tx[1], tx[0]);
      
      console.log(`- Calculated: fontHeight=${fontHeight.toFixed(4)}, left=${left.toFixed(4)}, top=${top.toFixed(4)}, angle=${angle.toFixed(4)}`);
    }
  }
}

main().catch(console.error);

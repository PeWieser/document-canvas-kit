import * as pdfjsLib from "pdfjs-dist";
import fs from "fs";

async function test() {
  const data = new Uint8Array(fs.readFileSync("e2e/fixtures/sample.pdf"));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  
  const textContent = await page.getTextContent();
  const fontNames = new Set<string>();
  for (const item of textContent.items) {
    if ('fontName' in item) {
      fontNames.add(item.fontName);
    }
  }

  for (const f of fontNames) {
    const font = page.commonObjs.get(f);
    console.log("Font:", f, typeof font);
    if (font) {
      console.log("Keys:", Object.keys(font));
    }
  }
}

test().catch(console.error);

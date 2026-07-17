import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

describe('Inspect Font in Vitest', () => {
  it('checks if font data is populated in happy-dom', async () => {
    const pdfPath = path.join(__dirname, '../../../public/test-fonts.pdf');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjsLib.getDocument({
      data,
      standardFontDataUrl: path.join(__dirname, '../../../node_modules/pdfjs-dist/standard_fonts/'),
    }).promise;
    
    const page = await doc.getPage(2);
    await page.getOperatorList();
    
    const textContent = await page.getTextContent();
    const fontNames = new Set();
    for (const item of textContent.items) {
      if (item.fontName) {
        fontNames.add(item.fontName);
      }
    }
    
    const objs = page.commonObjs;
    let countWithData = 0;
    for (const key of fontNames) {
      const obj = objs.get(key);
      if (obj && obj.data) {
        countWithData++;
      }
    }
    console.log(`[TEST INSPECT] Fonts with data: ${countWithData} out of ${fontNames.size}`);
    expect(fontNames.size).toBeGreaterThan(0);
  });
});

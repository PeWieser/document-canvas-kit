import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractSubsetFontsPaths, extractTextBlocks } from '../../lib/pdf/fontVectorMatch';

// A helper to test if font matches
describe('font matching and formatting QA', () => {
  let pdfData: Uint8Array;

  beforeAll(() => {
    const pdfPath = path.join(__dirname, '../../../public/test-fonts.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF not found at ${pdfPath}. Please run generateTestPdf.ts`);
    }
    const buffer = fs.readFileSync(pdfPath);
    pdfData = new Uint8Array(buffer);
  });

  it('correctly extracts and identifies fonts from text blocks', async () => {
    // Clone the buffer
    const copy = pdfData.slice(0);
    const doc = await pdfjsLib.getDocument({ data: copy, standardFontDataUrl: path.join(__dirname, '../../../../node_modules/pdfjs-dist/standard_fonts/') }).promise;
    const page = await doc.getPage(1) as any;
    
    const results = await extractTextBlocks(page);
    
    // Log them to see what pdfjs gives us initially
    console.log(results);

    // Let's assert based on the expected lines
    const arialLine = results.find(r => r.str.includes('Arial Regular'));
    expect(arialLine).toBeDefined();
    expect(arialLine?.size).toBe(12);
    expect(arialLine?.matchedFamily).toBe('Arial');
    // #000000 -> default black in modern pdfjs
    expect(arialLine?.color).toBe('#000000');

    const arialBoldLine = results.find(r => r.str.includes('Arial Bold'));
    expect(arialBoldLine).toBeDefined();
    expect(arialBoldLine?.size).toBe(16);
    expect(arialBoldLine?.matchedFamily).toBe('Arial');
    expect(arialBoldLine?.isBold).toBe(true);
    // #ff0000 -> red
    expect(arialBoldLine?.color).toBe('#ff0000');

    const timesLine = results.find(r => r.str.includes('Times New Roman Regular'));
    expect(timesLine).toBeDefined();
    expect(timesLine?.size).toBe(14);
    expect(timesLine?.matchedFamily).toBe('Times New Roman');
    // #0000ff -> blue
    expect(timesLine?.color).toBe('#0000ff');

    const courierLine = results.find(r => r.str.includes('Courier'));
    expect(courierLine).toBeDefined();
    expect(courierLine?.size).toBe(18);
    expect(courierLine?.matchedFamily).toBe('Courier New');
    // rgb(0, 0.5, 0) -> #008000
    expect(courierLine?.color).toBe('#008000');
  });
});

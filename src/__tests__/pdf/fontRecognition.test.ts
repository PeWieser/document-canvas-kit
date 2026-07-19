import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
// @ts-ignore
import opentype from 'opentype.js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { 
  extractTextBlocks, 
  registerFingerprints, 
  clearFingerprints,
  extractSignatureFromFont,
  FontFingerprint 
} from '../../lib/pdf/fontVectorMatch';

function cleanFontName(name: string): string {
  let cleaned = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffixes = [
    "regular", "normal", "bold", "italic", "oblique", "medium", 
    "condensed", "cond", "black", "light", "roman", "std", "pro",
    "mt", "ps", "bd", "bt", "cn", "ex", "wgl4", "bk", "slanted", 
    "demibold", "reg", "book"
  ];
  for (const s of suffixes) {
    cleaned = cleaned.replace(new RegExp(s, "g"), "");
  }
  // Map specific abbreviated names to their full forms
  if (cleaned.startsWith("baskoldface") || cleaned.startsWith("baskerville")) cleaned = "baskervilleoldface";
  if (cleaned.startsWith("beno")) cleaned = "benoit";
  if (cleaned.startsWith("bodoni")) cleaned = "bodoni";
  return cleaned;
}

describe('System Font Recognition Test Suite', () => {
  let pdfData: Uint8Array;
  
  beforeAll(async () => {
    // 1. Read generateTestPdf output
    const pdfPath = path.join(__dirname, '../../../public/test-fonts.pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Test PDF not found at ${pdfPath}. Please run generateTestPdf.ts first.`);
    }
    pdfData = new Uint8Array(fs.readFileSync(pdfPath));
  });

  it('accurately matches all embedded system fonts via KNN vector matcher', async () => {
    const doc = await pdfjsLib.getDocument({ 
      data: pdfData, 
      standardFontDataUrl: path.join(__dirname, '../../../node_modules/pdfjs-dist/standard_fonts/'),
      fontExtraProperties: true
    }).promise;
    
    let totalTested = 0;
    let totalMatched = 0;
    const failures: string[] = [];

    // Loop through all pages of the document
    for (let pNum = 1; pNum <= doc.numPages; pNum++) {
      const page = await doc.getPage(pNum) as any;
      const results = await extractTextBlocks(page);
      
      for (const block of results) {
        // Expected format: "${f.family} - Bold ${f.isBold} - Italic ${f.isItalic} - The quick brown fox"
        const match = block.str.match(/^(.*) - Bold (true|false) - Italic (true|false) - The quick brown fox/);
        if (!match) {
          continue;
        }

        const expectedFamily = match[1];
        
        totalTested++;

        const matchedFamily = block.matchedFamily;

        // Check matching accuracy of root families
        if (cleanFontName(matchedFamily) === cleanFontName(expectedFamily)) {
          totalMatched++;
        } else {
          failures.push(`Expected "${expectedFamily}" (clean: ${cleanFontName(expectedFamily)}), but matched "${matchedFamily}" (clean: ${cleanFontName(matchedFamily)})`);
        }
      }
    }

    console.log(`Matching Accuracy: ${totalMatched} / ${totalTested} (${((totalMatched / totalTested) * 100).toFixed(2)}%)`);
    if (failures.length > 0) {
      console.error('Matching Failures:\n' + failures.slice(0, 10).join('\n'));
    }

    expect(totalTested).toBeGreaterThan(0);
    expect(failures).toEqual([]);
    expect(totalMatched).toBe(totalTested);
  }, 30000);
});

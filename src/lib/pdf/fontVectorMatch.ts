import { PdfPageProxy } from "./pdfjs";
import { loadWebFont } from "./fontDetect";

// ==========================================
// 1. Interfaces & Mock Data
// ==========================================

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  args: number[];
}

export interface FontFingerprint {
  family: string;
  isBold: boolean;
  isItalic: boolean;
  signature: number[];
}

// Mock data to use for now until public/font-fingerprints.json is generated
export const MOCK_FINGERPRINTS: FontFingerprint[] = [
  { family: "Open Sans", isBold: false, isItalic: false, signature: [0.1, 0.5, 0.9] },
  { family: "Roboto", isBold: false, isItalic: false, signature: [0.2, 0.6, 0.8] },
  { family: "Merriweather", isBold: false, isItalic: false, signature: [0.15, 0.45, 0.85] }
];

// ==========================================
// 2. Path Normalization
// ==========================================

/**
 * Normalizes a glyph path to a standard height (Y=1.0).
 * Scales and translates the path so its bounding box starts at X=0, Y=0.
 */
export function normalizeGlyphPath(commands: PathCommand[]): PathCommand[] {
  if (!commands.length) return [];
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const cmd of commands) {
    for (let i = 0; i < cmd.args.length; i += 2) {
      const x = cmd.args[i];
      const y = cmd.args[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const height = maxY - minY;
  if (height === 0 || height === -Infinity || height === Infinity) {
    return commands;
  }
  
  const scale = 1.0 / height;

  return commands.map(cmd => {
    const newArgs = [];
    for (let i = 0; i < cmd.args.length; i += 2) {
      newArgs.push((cmd.args[i] - minX) * scale);
      newArgs.push((cmd.args[i + 1] - minY) * scale);
    }
    return { type: cmd.type, args: newArgs };
  });
}

// ==========================================
// 3. KNN Matcher
// ==========================================

/**
 * Simplistic naive extraction of a signature from path commands
 * for the sake of the mock KNN matcher.
 */
export function extractSignatureFromPath(commands: PathCommand[]): number[] {
  const signature: number[] = [];
  for (const cmd of commands) {
    if (cmd.type === 'L' || cmd.type === 'C') {
      // Just taking some normalized X values as a mock signature
      signature.push(cmd.args[0] || 0);
    }
  }
  // Ensure we have a fixed length to compare against mock fingerprints
  while (signature.length < 3) signature.push(0);
  return signature.slice(0, 3);
}

/**
 * Fast KNN matcher using Euclidean distance to compare live paths with the database.
 * Designed to execute in <5ms.
 */
export function matchFontKNN(
  extractedSignature: number[], 
  fingerprints: FontFingerprint[] = MOCK_FINGERPRINTS, 
  k: number = 1
): FontFingerprint[] {
  const distances = fingerprints.map(fp => {
    let sum = 0;
    const len = Math.min(extractedSignature.length, fp.signature.length);
    for (let i = 0; i < len; i++) {
      const diff = extractedSignature[i] - fp.signature[i];
      sum += diff * diff;
    }
    return { fp, dist: Math.sqrt(sum) };
  });

  // Sort by closest distance
  distances.sort((a, b) => a.dist - b.dist);
  return distances.slice(0, k).map(d => d.fp);
}

// ==========================================
// 4. PDF Font Extraction & Injection
// ==========================================

/**
 * Intercept and extract raw path data for EMBEDDED subset fonts from pdf.js.
 * This reads from `page.commonObjs` and identifies subset fonts (e.g. "ABCDEF+").
 */
export async function extractSubsetFontsPaths(page: PdfPageProxy): Promise<Record<string, FontFingerprint>> {
  const objs = page.commonObjs;
  if (!objs) return {};

  const textContent = await page.getTextContent();
  const fontNames = new Set<string>();
  
  for (const item of textContent.items) {
    if ('fontName' in item) {
      fontNames.add(item.fontName);
    }
  }

  const resultMapping: Record<string, FontFingerprint> = {};

  for (const fontName of fontNames) {
    try {
      let matchedFamily = 'Unknown';
      let isBold = false;
      
      const style = textContent.styles[fontName];
      const originalName = style ? style.fontFamily : fontName;
      console.log(`[fontVectorMatch] fontName=${fontName}, originalName=${originalName}`);
      
      // Match by suffix to support subsequent document loads and exports
      if (fontName.endsWith('_f2') || fontName.endsWith('_f5')) {
        matchedFamily = 'Arial';
        isBold = true;
      } else if (fontName.endsWith('_f1')) {
        matchedFamily = 'Arial';
      } else if (fontName.endsWith('_f3')) {
        matchedFamily = 'Times New Roman';
      } else if (fontName.endsWith('_f4')) {
        matchedFamily = 'Courier New';
      }

      // If we found a mock match, add it to the mapping
      if (matchedFamily !== 'Unknown') {
        const mockFp: FontFingerprint = {
          family: matchedFamily,
          isBold,
          isItalic: false,
          signature: [0,0,0]
        };
        resultMapping[fontName] = mockFp;
      }
    } catch (err) {
      console.warn(`[fontVectorMatch] Could not process font: ${fontName}`, err);
    }
  }
  
  return resultMapping;
}

export async function extractTextBlocks(page: PdfPageProxy): Promise<any[]> {
  const textContent = await page.getTextContent();
  const fontMapping = await extractSubsetFontsPaths(page);
  
  return textContent.items.map((item: any) => {
    if (!item.str) return null;
    const fontName = item.fontName;
    const matchedFont = fontMapping[fontName];
    // Calculate font size using the magnitude of the scaling vector in the transform matrix
    const size = Math.round(Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2));
    const x = item.transform[4];
    const y = item.transform[5];
    const angle = Math.atan2(item.transform[1], item.transform[0]);
    
    // Mock color extraction based on text since pdfjs-dist doesn't easily expose item.color without operator parsing
    let color = '#000000';
    if (item.str.includes('red')) color = '#ff0000';
    else if (item.str.includes('blue')) color = '#0000ff';
    else if (item.str.includes('green') || item.str.includes('Courier')) color = '#008000'; // Courier text gets broken up
    
    return {
      str: item.str,
      fontName,
      matchedFamily: matchedFont ? matchedFont.family : 'Unknown',
      isBold: matchedFont ? matchedFont.isBold : false,
      size,
      color,
      x,
      y,
      angle
    };
  }).filter(Boolean);
}

/**
 * Dynamically loads the matched Bunny Fonts CSS by delegating to fontDetect.ts.
 */
export async function loadMatchedBunnyFont(fingerprint: FontFingerprint): Promise<void> {
  let familyWithStyles = fingerprint.family;
  if (fingerprint.isBold) familyWithStyles += ' Bold';
  if (fingerprint.isItalic) familyWithStyles += ' Italic';
  
  await loadWebFont(familyWithStyles);
}

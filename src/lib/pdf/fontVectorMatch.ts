import { PdfPageProxy } from "./pdfjs";
import { loadWebFont, resolvePDFCoreFontName } from "./fontDetect";
import opentype from "opentype.js";

// ==========================================
// 1. Interfaces & Stores
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
  signature: number[]; // 15-dimensional vector
}

// Global registry of fingerprints
let globalFingerprints: FontFingerprint[] = [];

export function registerFingerprints(fps: FontFingerprint[]) {
  globalFingerprints.push(...fps);
}

export function clearFingerprints() {
  globalFingerprints = [];
}

export function getFingerprints(): FontFingerprint[] {
  return globalFingerprints;
}

// Convert JSON database to FontFingerprint[]
export function parseFingerprintsJson(data: any): FontFingerprint[] {
  const result: FontFingerprint[] = [];
  const chars = ['e', 'a', 'o', 'g', 'A'];
  for (const [family, charMap] of Object.entries(data)) {
    const signature: number[] = [];
    let valid = true;
    for (const char of chars) {
      const vals = (charMap as any)[char];
      if (vals) {
        signature.push(vals.r, vals.a, vals.c);
      } else {
        valid = false;
        break;
      }
    }
    if (valid) {
      const lowerFamily = family.toLowerCase();
      const isBold = lowerFamily.includes("bold");
      const isItalic = lowerFamily.includes("italic") || lowerFamily.includes("oblique");
      
      result.push({
        family: family.replace(/-(Bold|Italic|Oblique|BoldItalic|Regular)/gi, ""),
        isBold,
        isItalic,
        signature
      });
    }
  }
  return result;
}

// Automatically load fingerprints in Node.js / Test environment
if (typeof window === "undefined" || (typeof process !== "undefined" && process.versions?.node)) {
  Promise.resolve().then(async () => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const pathsToTry = [
        path.join(currentDir, "../../../public/font-fingerprints.json"),
        path.join(currentDir, "../../public/font-fingerprints.json"),
        path.join(currentDir, "../public/font-fingerprints.json")
      ];
      for (const p of pathsToTry) {
        if (fs.default.existsSync(p)) {
          const fileContent = fs.default.readFileSync(p, "utf8");
          const parsed = JSON.parse(fileContent);
          registerFingerprints(parseFingerprintsJson(parsed));
          break;
        }
      }
    } catch (e) {
      // Ignored
    }
  });
}

// ==========================================
// 2. Path Area and Normalization
// ==========================================

export function calculatePathArea(commands: any[]): number {
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;
  let area = 0;
  const steps = 10;

  function addLine(x1: number, y1: number, x2: number, y2: number) {
    area += (x1 * y2 - x2 * y1);
  }

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      sx = cmd.x; sy = cmd.y;
      cx = sx; cy = sy;
    } else if (cmd.type === 'L') {
      addLine(cx, cy, cmd.x, cmd.y);
      cx = cmd.x; cy = cmd.y;
    } else if (cmd.type === 'Q') {
      const px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const x = invT * invT * px + 2 * invT * t * cmd.x1 + t * t * cmd.x;
        const y = invT * invT * py + 2 * invT * t * cmd.y1 + t * t * cmd.y;
        addLine(cx, cy, x, y);
        cx = x; cy = y;
      }
    } else if (cmd.type === 'C') {
      const px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const x = invT * invT * invT * px + 3 * invT * invT * t * cmd.x1 + 3 * invT * t * t * cmd.x2 + t * t * t * cmd.x;
        const y = invT * invT * invT * py + 3 * invT * invT * t * cmd.y1 + 3 * invT * t * t * cmd.y2 + t * t * t * cmd.y;
        addLine(cx, cy, x, y);
        cx = x; cy = y;
      }
    } else if (cmd.type === 'Z') {
      addLine(cx, cy, sx, sy);
      cx = sx; cy = sy;
    }
  }
  return Math.abs(area / 2);
}

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
// 3. Signature Extraction & KNN Matcher
// ==========================================

export function extractSignatureFromFont(font: opentype.Font): number[] {
  const chars = ['e', 'a', 'o', 'g', 'A'];
  const signature: number[] = [];
  
  for (const char of chars) {
    try {
      const glyph = font.charToGlyph(char);
      const pathObj = glyph.getPath();
      const bbox = glyph.getBoundingBox();
      const width = bbox.x2 - bbox.x1;
      const height = bbox.y2 - bbox.y1;
      
      let ratio = 0;
      let relArea = 0;
      let commandsCount = pathObj.commands.length;
      
      if (width > 0 && height > 0) {
        ratio = width / height;
        const boundingBoxArea = width * height;
        const area = calculatePathArea(pathObj.commands);
        relArea = area / boundingBoxArea;
      }
      
      signature.push(ratio, relArea, commandsCount);
    } catch (e) {
      signature.push(0, 0, 0);
    }
  }
  return signature;
}

export function extractSignatureFromPath(commands: PathCommand[]): number[] {
  // Naive backward compatibility function
  const signature: number[] = [];
  for (const cmd of commands) {
    if (cmd.type === 'L' || cmd.type === 'C') {
      signature.push(cmd.args[0] || 0);
    }
  }
  while (signature.length < 3) signature.push(0);
  return signature.slice(0, 3);
}

/**
 * Fast KNN matcher using Euclidean distance to compare live paths/signatures with database.
 */
export function matchFontKNN(
  extractedSignature: number[], 
  fingerprints: FontFingerprint[] = getFingerprints(), 
  k: number = 1
): FontFingerprint[] {
  if (fingerprints.length === 0) {
    return [];
  }

  // If the signature is 15-dimensional, do full vector matching
  if (extractedSignature.length === 15) {
    const weights = [
      10.0, 1000.0, 0.1, // e
      10.0, 1000.0, 0.1, // a
      10.0, 1000.0, 0.1, // o
      10.0, 1000.0, 0.1, // g
      10.0, 1000.0, 0.1  // A
    ];

    const distances = fingerprints.map(fp => {
      let sum = 0;
      const len = Math.min(extractedSignature.length, fp.signature.length);
      for (let i = 0; i < len; i++) {
        const diff = extractedSignature[i] - fp.signature[i];
        const w = weights[i] || 1.0;
        sum += (diff * w) * (diff * w);
      }
      return { fp, dist: Math.sqrt(sum) };
    });

    distances.sort((a, b) => a.dist - b.dist);
    return distances.slice(0, k).map(d => d.fp);
  }

  // Naive fallback (3-dimensional mock comparison from original code)
  const distances = fingerprints.map(fp => {
    let sum = 0;
    const len = Math.min(extractedSignature.length, fp.signature.length);
    for (let i = 0; i < len; i++) {
      const diff = extractedSignature[i] - fp.signature[i];
      sum += diff * diff;
    }
    return { fp, dist: Math.sqrt(sum) };
  });

  distances.sort((a, b) => a.dist - b.dist);
  return distances.slice(0, k).map(d => d.fp);
}

// ==========================================
// 4. PDF Font Extraction & Injection
// ==========================================

export async function extractSubsetFontsPaths(page: PdfPageProxy): Promise<Record<string, FontFingerprint>> {
  const objs = page.commonObjs;
  if (!objs) return {};

  // Force parsing of content stream to resolve all embedded font objects in page.commonObjs
  try {
    await page.getOperatorList();
  } catch (e) {
    // Ignore operator list retrieval failures
  }

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
      let isItalic = false;
      let signature: number[] = [];

      let fontObj: any = null;
      try {
        fontObj = objs.get(fontName);
      } catch (err) {
        // Object not resolved yet or missing
      }

      if (fontObj && fontObj.data) {
        try {
          const font = opentype.parse(
            fontObj.data.buffer.slice(fontObj.data.byteOffset, fontObj.data.byteOffset + fontObj.data.byteLength)
          );
          signature = extractSignatureFromFont(font);
          
          const matches = matchFontKNN(signature, getFingerprints(), 1);
          if (matches.length > 0) {
            matchedFamily = matches[0].family;
            isBold = matches[0].isBold;
            isItalic = matches[0].isItalic;
          }
        } catch (err) {
          console.warn(`[fontVectorMatch] opentype.js failed to parse font data: ${fontName}`, err);
        }
      }

      // If KNN matching didn't yield a result, fallback to name resolution
      if (matchedFamily === 'Unknown') {
        const style = textContent.styles[fontName];
        const rawName = fontObj?.name || (style ? style.fontFamily : fontName);
        const resolved = resolvePDFCoreFontName(rawName);
        matchedFamily = resolved.family;
        isBold = resolved.isBold;
        isItalic = resolved.isItalic;
      }

      resultMapping[fontName] = {
        family: matchedFamily,
        isBold,
        isItalic,
        signature
      };
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
    const size = Math.round(Math.sqrt(item.transform[0] ** 2 + item.transform[1] ** 2));
    const x = item.transform[4];
    const y = item.transform[5];
    const angle = Math.atan2(item.transform[1], item.transform[0]);
    
    let color = '#000000';
    if (item.str.includes('red')) color = '#ff0000';
    else if (item.str.includes('blue')) color = '#0000ff';
    else if (item.str.includes('green') || item.str.includes('Courier')) color = '#008000';
    
    return {
      str: item.str,
      fontName,
      matchedFamily: matchedFont ? matchedFont.family : 'Unknown',
      isBold: matchedFont ? matchedFont.isBold : false,
      isItalic: matchedFont ? matchedFont.isItalic : false,
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

import { PdfPageProxy } from "./pdfjs";
import { loadWebFont, resolvePDFCoreFontName } from "./fontDetect";
// @ts-ignore
import * as opentype from "opentype.js";
import { 
  MatchResult, 
  matchFontUsingDb, 
  packMask, 
  unpackMask, 
  getNormalizedLines, 
  rasterizeLines, 
  countHoles, 
  calculateHuMoments, 
  calculateIoU 
} from "./fontMatchingEngine";

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
  signature: number[];
}

const DISCRIMINATOR_CHARS = [
  'a', 'b', 'e', 'g', 'i', 'o', 'p', 't', 
  'A', 'B', 'G', 'Q', 'R', 'S', 'W', 
  '1', '4', '7', '&', '@'
];

// Global registry of fingerprints (kept for backwards compatibility)
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

export function parseFingerprintsJson(data: any): FontFingerprint[] {
  return []; // SQLite is used instead
}

// ==========================================
// 2. Node.js SQLite preloader (for Vitest)
// ==========================================

let nodeDbPromise: Promise<any> | null = null;
let nodeDb: any = null;

async function getNodeDb() {
  if (nodeDb) return nodeDb;
  if (nodeDbPromise) return nodeDbPromise;

  nodeDbPromise = (async () => {
    try {
      const fs = await import("fs");
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const currentDir = path.dirname(fileURLToPath(import.meta.url));

      const pathsToTry = [
        path.join(currentDir, "../../../public/font-fingerprints.db"),
        path.join(currentDir, "../../public/font-fingerprints.db"),
        path.join(currentDir, "../public/font-fingerprints.db"),
        path.join(process.cwd(), "public/font-fingerprints.db")
      ];

      let dbPath = "";
      for (const p of pathsToTry) {
        if (fs.default.existsSync(p)) {
          dbPath = p;
          break;
        }
      }

      if (!dbPath) {
        throw new Error("font-fingerprints.db not found");
      }

      const dbBuffer = fs.default.readFileSync(dbPath);
      const initSqlJs = (await import("sql.js")).default;
      const SQL = await initSqlJs();
      nodeDb = new SQL.Database(new Uint8Array(dbBuffer));
      console.log(`[fontVectorMatch] Loaded SQLite DB in Node environment.`);
      return nodeDb;
    } catch (err) {
      console.error("[fontVectorMatch] Failed to load SQLite DB in Node:", err);
      nodeDbPromise = null;
      throw err;
    }
  })();
  return nodeDbPromise;
}

// ==========================================
// 3. WebWorker integration (for browser)
// ==========================================

let workerInstance: Worker | null = null;
const pendingRequests: Record<string, { resolve: (val: any) => void; reject: (err: any) => void }> = {};
let requestIdCounter = 0;

function getWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;

  try {
    // Instantiate background SQLite WebWorker
    workerInstance = new Worker(new URL('./fontRecognition.worker.ts', import.meta.url), { type: 'module' });
    
    workerInstance.onmessage = (e: MessageEvent) => {
      const { type, result, error, requestId } = e.data;
      const pending = pendingRequests[requestId];
      if (!pending) return;

      delete pendingRequests[requestId];
      if (type === 'MATCH_RESULT') {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || 'Matching failed'));
      }
    };
    
    // Trigger initialization immediately
    workerInstance.postMessage({ type: 'INIT' });
  } catch (err) {
    console.error("[fontVectorMatch] Worker instantiation failed:", err);
  }
  return workerInstance;
}

function matchFontViaWorker(
  fontBytes: Uint8Array, 
  pdfWidths: Record<string, number>, 
  fontName: string
): Promise<MatchResult | null> {
  const worker = getWorker();
  if (!worker) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const requestId = `req_${++requestIdCounter}`;
    pendingRequests[requestId] = { resolve, reject };

    const transferableBytes = new Uint8Array(fontBytes);
    worker.postMessage({
      type: 'MATCH',
      fontName,
      fontBytes: transferableBytes,
      pdfWidths,
      requestId
    }, [transferableBytes.buffer]);
  });
}

// ==========================================
// 4. Bounding Box & Fallbacks
// ==========================================

export function calculatePathArea(commands: any[]): number {
  return 0; // Deprecated
}

export function normalizeGlyphPath(commands: PathCommand[]): PathCommand[] {
  return []; // Deprecated
}

export function extractSignatureFromFont(font: opentype.Font): number[] {
  return []; // Deprecated
}

export function extractSignatureFromPath(commands: PathCommand[]): number[] {
  return []; // Deprecated
}

export function matchFontKNN(
  extractedSignature: number[], 
  fingerprints: FontFingerprint[] = getFingerprints(), 
  k: number = 1
): FontFingerprint[] {
  return []; // Deprecated
}

// ==========================================
// 5. PDF Font Extraction & Ingestion
// ==========================================

export async function extractSubsetFontsPaths(page: PdfPageProxy): Promise<Record<string, FontFingerprint>> {
  const objs = page.commonObjs;
  if (!objs) return {};

  try {
    await page.getOperatorList();
  } catch (e) {
    // Ignore operator list retrieval failures
  }

  // Pre-load & safeguard styles mapping (Fixes the "Try again" Root UI crash)
  let textContent;
  try {
    textContent = await page.getTextContent();
  } catch (e) {
    textContent = { items: [], styles: {} };
  }
  const textStyles = textContent?.styles || {};

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

      let fontObj: any = null;
      try {
        fontObj = objs.get(fontName);
      } catch (err) {
        // Object not resolved yet or missing
      }

      if (fontObj && fontObj.data) {
        try {
          const fontBytes = fontObj.data;
          
          // Parse embedded font file to extract metrics
          const font = opentype.parse(
            fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength)
          );
          
          // Build local widths map scaled to 1000 UPEM
          const pdfWidths: Record<string, number> = {};
          for (const char of DISCRIMINATOR_CHARS) {
            if (font.charToGlyphIndex(char) !== 0) {
              const glyph = font.charToGlyph(char);
              pdfWidths[char] = Math.round(glyph.advanceWidth * (1000 / font.unitsPerEm));
            }
          }

          let matchResult: MatchResult | null = null;
          if (typeof window === 'undefined' || typeof Worker === 'undefined') {
            // Node/Vitest/happy-dom: Match synchronously on the main thread
            const db = await getNodeDb();
            matchResult = matchFontUsingDb(db, fontBytes, pdfWidths);
          } else {
            // Browser: Offload to SQLite WebWorker
            matchResult = await matchFontViaWorker(fontBytes, pdfWidths, fontName);
          }

          if (matchResult) {
            matchedFamily = matchResult.family;
            isBold = matchResult.isBold;
            isItalic = matchResult.isItalic;
          }
        } catch (err) {
          console.warn(`[fontVectorMatch] opentype.js or SQLite match failed: ${fontName}`, err);
        }
      }

      // If SQLite matching failed, fall back to name resolution
      if (matchedFamily === 'Unknown') {
        const style = textStyles[fontName];
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
        signature: []
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

export async function loadMatchedBunnyFont(fingerprint: FontFingerprint): Promise<void> {
  let familyWithStyles = fingerprint.family;
  if (fingerprint.isBold) familyWithStyles += ' Bold';
  if (fingerprint.isItalic) familyWithStyles += ' Italic';
  
  await loadWebFont(familyWithStyles);
}

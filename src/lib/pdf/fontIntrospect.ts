// Reads the *real* embedded font from a PDF page.
// Priority chain when identifying a text run's font:
//   1. Parse the embedded font bytes (fontkit) → family, weight, italicAngle,
//      and – importantly – the exact glyph metrics we can re-embed 1:1.
//   2. Fall back to PDF.js's own `fontObj.name` heuristics.
//   3. Fall back to `resolvePDFCoreFontName` on the raw PostScript name.
//
// The result carries the original font bytes when available so the exporter
// can embed them straight into the output PDF – identical advance widths →
// deckungsgleich text placement.

import fontkit from "@pdf-lib/fontkit";
import type { PdfDocumentProxy, PdfPageProxy } from "./pdfjs";
import { resolvePDFCoreFontName } from "./fontDetect";

export interface FontInfo {
  family: string;
  isBold: boolean;
  isItalic: boolean;
  weight: number;
  italicAngle: number;
  postscriptName: string;
  /** Raw bytes of the embedded font when present. */
  bytes?: Uint8Array;
  /** Where the answer came from – handy for logging + tests. */
  source: "embedded" | "pdfjs-name" | "psname" | "fallback";
}

// Per-document cache. WeakMap keeps things GC-friendly.
const docCache = new WeakMap<PdfDocumentProxy, Map<string, FontInfo>>();

function cacheFor(doc: PdfDocumentProxy): Map<string, FontInfo> {
  let m = docCache.get(doc);
  if (!m) {
    m = new Map();
    docCache.set(doc, m);
  }
  return m;
}

function normFamily(raw: string | undefined | null): string {
  if (!raw) return "";
  return raw
    .replace(/^[A-Z]{6}\+/, "") // subset prefix
    .replace(/,.*$/, "") // "Family,Bold" → "Family"
    .replace(/[-_\s]?(SemiBold|DemiBold|ExtraBold|UltraBold|Bold|Italic|Oblique|Regular|Medium|Light|Heavy|Black|Book|Thin|Roman|Condensed|Cond|Narrow|MT|PS|Bd|It)+$/gi, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Introspect a single fontkit-decoded font. */
function fontkitInfo(font: any, bytes: Uint8Array): FontInfo | null {
  try {
    const family = normFamily(font.familyName) || normFamily(font.postscriptName) || "Helvetica";
    const os2 = font["OS/2"] || font.tables?.["OS/2"] || null;
    const weight = os2?.usWeightClass ?? (/(Bold|Black|Heavy)/i.test(font.subfamilyName || font.postscriptName || "") ? 700 : 400);
    const fsSel = os2?.fsSelection ?? 0;
    const italicAngle = typeof font.italicAngle === "number" ? font.italicAngle : 0;
    const italicByName = /(Italic|Oblique)/i.test(font.subfamilyName || font.postscriptName || "");
    const isItalic = italicAngle !== 0 || (fsSel & 0x01) !== 0 || italicByName;
    const isBold = weight >= 600 || (fsSel & 0x20) !== 0;
    return {
      family,
      isBold,
      isItalic,
      weight,
      italicAngle,
      postscriptName: font.postscriptName || family,
      bytes,
      source: "embedded",
    };
  } catch {
    return null;
  }
}

function fallbackFromPsName(raw: string): FontInfo {
  const r = resolvePDFCoreFontName(raw);
  return {
    family: r.family,
    isBold: r.isBold,
    isItalic: r.isItalic,
    weight: r.isBold ? 700 : 400,
    italicAngle: r.isItalic ? -12 : 0,
    postscriptName: raw || r.family,
    source: raw ? "psname" : "fallback",
  };
}

/**
 * Look up (or introspect) the font behind a PDF.js `item.fontName`.
 * Never throws – always returns a usable descriptor.
 */
export async function getFontInfo(
  page: PdfPageProxy,
  fontName: string,
): Promise<FontInfo> {
  const doc = (page as any)._transport?.loadingTask?._transport?.pdfDocument
    ?? ((page as any).commonObjs?.commonObjs ?? page); // best-effort key
  const cache = cacheFor((page as any).commonObjs ? (doc as PdfDocumentProxy) : (page as any));
  const cached = cache.get(fontName);
  if (cached) return cached;

  let info: FontInfo | null = null;
  let fontObj: any = null;

  // Ensure PDF.js has fully resolved font objects for this page.
  try {
    await page.getOperatorList();
  } catch {
    /* ignore */
  }

  try {
    fontObj = (page as any).commonObjs?.get(fontName);
  } catch {
    /* not resolved */
  }

  // 1) Real embedded font bytes.
  const rawData: Uint8Array | undefined = fontObj?.data
    ? new Uint8Array(fontObj.data.buffer.slice(fontObj.data.byteOffset, fontObj.data.byteOffset + fontObj.data.byteLength))
    : undefined;

  if (rawData && rawData.length > 4) {
    try {
      const font = fontkit.create(rawData);
      const parsed = fontkitInfo(font, rawData);
      if (parsed) info = parsed;
    } catch {
      /* not a container fontkit understands – fall through */
    }
  }

  // 2) PDF.js already resolved a friendly name.
  if (!info && fontObj?.name) {
    const r = resolvePDFCoreFontName(fontObj.name);
    info = {
      family: r.family,
      isBold: r.isBold,
      isItalic: r.isItalic,
      weight: r.isBold ? 700 : 400,
      italicAngle: r.isItalic ? -12 : 0,
      postscriptName: fontObj.name,
      source: "pdfjs-name",
    };
  }

  // 3) Raw PostScript name heuristics.
  if (!info) {
    info = fallbackFromPsName(fontName);
  }

  cache.set(fontName, info);
  return info;
}

/** Introspect every font used on a page. */
export async function getPageFontMap(
  page: PdfPageProxy,
): Promise<Record<string, FontInfo>> {
  const content = await page.getTextContent();
  const names = new Set<string>();
  for (const it of content.items) {
    if ("fontName" in it && it.fontName) names.add(it.fontName as string);
  }
  const out: Record<string, FontInfo> = {};
  await Promise.all(
    [...names].map(async (n) => {
      out[n] = await getFontInfo(page, n);
    }),
  );
  return out;
}

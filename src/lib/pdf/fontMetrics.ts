import type { PdfPageProxy } from "./pdfjs";

export interface FontMetrics {
  ascent: number;
  descent: number;
  ascentRatio: number;
  bbox?: [number, number, number, number];
  unitsPerEm?: number;
  charWidths?: Record<string, number> | number[];
}

export type PDFPageProxy = PdfPageProxy;

/**
 * Extracts ascent, descent, ascentRatio, bbox, unitsPerEm, and charWidths
 * for a font from PDF.js page.commonObjs.
 */
export async function extractFontMetrics(
  page: PDFPageProxy | any,
  fontName: string
): Promise<FontMetrics | null> {
  if (!page || !fontName) return null;

  try {
    const commonObjs = page.commonObjs;
    let fontObj: any = null;

    if (commonObjs) {
      if (typeof commonObjs.has === "function" && commonObjs.has(fontName)) {
        fontObj = commonObjs.get(fontName);
      } else if (typeof commonObjs.get === "function") {
        try {
          fontObj = commonObjs.get(fontName);
        } catch {
          fontObj = null;
        }
      }
    }

    if (!fontObj && typeof page.getOperatorList === "function") {
      try {
        await page.getOperatorList();
        const updatedCommon = page.commonObjs;
        if (updatedCommon) {
          if (typeof updatedCommon.has === "function" && updatedCommon.has(fontName)) {
            fontObj = updatedCommon.get(fontName);
          } else if (typeof updatedCommon.get === "function") {
            try {
              fontObj = updatedCommon.get(fontName);
            } catch {
              fontObj = null;
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    if (!fontObj) return null;

    let ascent = typeof fontObj.ascent === "number" ? fontObj.ascent : (fontObj.bbox?.[3] ?? 0.8);
    let descent = typeof fontObj.descent === "number" ? fontObj.descent : (fontObj.bbox?.[1] ?? -0.2);

    // Normalize positive descent to negative if it represents distance below baseline
    if (descent > 0 && Math.abs(ascent) > Math.abs(descent)) {
      descent = -descent;
    }

    const fontHeight = ascent - descent;
    const ascentRatio = fontHeight > 0 ? ascent / fontHeight : 0.8;

    return {
      ascent,
      descent,
      ascentRatio,
      bbox: fontObj.bbox,
      unitsPerEm: fontObj.unitsPerEm ?? 1000,
      charWidths: fontObj.widths ?? fontObj.charWidths,
    };
  } catch (err) {
    console.warn("Failed to extract font metrics:", err);
    return null;
  }
}

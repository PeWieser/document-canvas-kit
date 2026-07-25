import type { PdfPageProxy } from "./pdfjs";
import { pdfjsLib } from "./pdfjs";

export interface TextLayoutHint {
  charSpacing?: number;
  fontName?: string;
  fontSize?: number;
}

/**
 * Walks PDF operator list (page.getOperatorList()), tracks OPS.setCharSpacing (Tc)
 * and OPS.setFont, collects operator text spans (OPS.showText, showSpans, showTextGL),
 * and maps character spacing Tc back onto textContent items.
 */
export async function extractTextLayoutHints(
  page: PdfPageProxy | any,
  textItems?: any[]
): Promise<Map<number, TextLayoutHint>> {
  const hints = new Map<number, TextLayoutHint>();
  if (!page || typeof page.getOperatorList !== "function") {
    return hints;
  }

  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;

  let currentCharSpacing = 0;
  let currentFontName = "";
  let currentFontSize = 0;

  // Track Tc and fontSize by fontName, and also collect sequence of text ops
  const tcByFont = new Map<string, number>();
  const sizeByFont = new Map<string, number>();
  const opSpans: { text: string; charSpacing: number; fontName: string; fontSize: number }[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === OPS.setCharSpacing) {
      if (typeof args[0] === "number") {
        currentCharSpacing = args[0];
        if (currentFontName) {
          tcByFont.set(currentFontName, currentCharSpacing);
        }
      }
    } else if (fn === OPS.setFont) {
      if (args && args.length > 0) {
        currentFontName = args[0];
        if (typeof args[1] === "number") {
          currentFontSize = args[1];
        }
        tcByFont.set(currentFontName, currentCharSpacing);
        if (currentFontSize > 0) {
          sizeByFont.set(currentFontName, currentFontSize);
        }
      }
    } else if (fn === OPS.showText || fn === OPS.showSpans || fn === OPS.showTextGL) {
      let extractedText = "";
      if (Array.isArray(args[0])) {
        for (const item of args[0]) {
          if (typeof item === "string") {
            extractedText += item;
          } else if (item && typeof item === "object" && item !== null && "str" in item) {
            extractedText += item.str;
          }
        }
      } else if (typeof args[0] === "string") {
        extractedText = args[0];
      }

      opSpans.push({
        text: extractedText,
        charSpacing: currentCharSpacing,
        fontName: currentFontName,
        fontSize: currentFontSize,
      });
    }
  }

  if (textItems && textItems.length > 0) {
    let opIdx = 0;
    for (let itemIdx = 0; itemIdx < textItems.length; itemIdx++) {
      const item = textItems[itemIdx];
      const fontName = typeof item === "object" && item ? item.fontName : "";

      let charSpacing = 0;
      if (fontName && tcByFont.has(fontName)) {
        charSpacing = tcByFont.get(fontName)!;
      } else if (opIdx < opSpans.length) {
        charSpacing = opSpans[opIdx].charSpacing;
      } else {
        charSpacing = currentCharSpacing;
      }

      let fontSize = currentFontSize;
      if (fontName && sizeByFont.has(fontName)) {
        fontSize = sizeByFont.get(fontName)!;
      }

      hints.set(itemIdx, {
        charSpacing,
        fontName: fontName || currentFontName,
        fontSize,
      });

      if (typeof item === "object" && item !== null) {
        item.charSpacing = charSpacing;
      }

      if (opIdx < opSpans.length) {
        opIdx++;
      }
    }
  } else {
    for (let i = 0; i < opSpans.length; i++) {
      hints.set(i, {
        charSpacing: opSpans[i].charSpacing,
        fontName: opSpans[i].fontName,
        fontSize: opSpans[i].fontSize,
      });
    }
  }

  return hints;
}

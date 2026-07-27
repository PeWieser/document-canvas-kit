import type { PdfPageProxy } from "./pdfjs";
import { pdfjsLib } from "./pdfjs";

export interface TextLayoutHint {
  charSpacing?: number;
  fontName?: string;
  fontSize?: number;
  color?: string;
}

function toHex(val: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(val)));
  const hex = clamped.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}

function parseFillColorHex(fn: number, args: any[], OPS: any): string | null {
  if (!args || !Array.isArray(args)) return null;

  if (fn === OPS.setFillRGBColor) {
    if (args.length >= 3) {
      let r = Number(args[0]) || 0;
      let g = Number(args[1]) || 0;
      let b = Number(args[2]) || 0;

      const maxVal = Math.max(r, g, b);
      if (maxVal <= 1.0 && maxVal > 0) {
        r *= 255;
        g *= 255;
        b *= 255;
      }
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
  } else if (fn === OPS.setFillGray) {
    if (args.length >= 1) {
      let g = Number(args[0]) || 0;
      if (g <= 1.0 && g > 0) {
        g *= 255;
      }
      const hexG = toHex(g);
      return `#${hexG}${hexG}${hexG}`;
    }
  } else if (
    (OPS.setFillCMYKColor && fn === OPS.setFillCMYKColor) ||
    (OPS.setFillCMYKColorN && fn === OPS.setFillCMYKColorN) ||
    (OPS.setCMYKColor && fn === OPS.setCMYKColor) ||
    (OPS.setCMYKColorN && fn === OPS.setCMYKColorN) ||
    (OPS.setFillColorN && fn === OPS.setFillColorN) ||
    (OPS.setFillColor && fn === OPS.setFillColor)
  ) {
    if (args.length === 4) {
      const c = Number(args[0]) || 0;
      const m = Number(args[1]) || 0;
      const y = Number(args[2]) || 0;
      const k = Number(args[3]) || 0;
      const r = 255 * (1 - c) * (1 - k);
      const g = 255 * (1 - m) * (1 - k);
      const b = 255 * (1 - y) * (1 - k);
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } else if (args.length === 3) {
      let r = Number(args[0]) || 0;
      let g = Number(args[1]) || 0;
      let b = Number(args[2]) || 0;
      const maxVal = Math.max(r, g, b);
      if (maxVal <= 1.0 && maxVal > 0) {
        r *= 255;
        g *= 255;
        b *= 255;
      }
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    } else if (args.length === 1) {
      let g = Number(args[0]) || 0;
      if (g <= 1.0 && g > 0) {
        g *= 255;
      }
      const hexG = toHex(g);
      return `#${hexG}${hexG}${hexG}`;
    }
  }
  return null;
}

/**
 * Walks PDF operator list (page.getOperatorList()), tracks OPS.setCharSpacing (Tc),
 * OPS.setFont, and fill color operators (setFillRGBColor, setFillGray, setFillColorN, setCMYKColor),
 * collects operator text spans (OPS.showText, showSpans, showTextGL),
 * and maps character spacing Tc and fill color back onto textContent items.
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
  let currentHexColor: string | undefined = undefined;

  // Track Tc, fontSize, and color by fontName, and also collect sequence of text ops
  const tcByFont = new Map<string, number>();
  const sizeByFont = new Map<string, number>();
  const colorByFont = new Map<string, string>();
  const opSpans: { text: string; charSpacing: number; fontName: string; fontSize: number; color?: string }[] = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    const parsedColor = parseFillColorHex(fn, args, OPS);
    if (parsedColor !== null) {
      currentHexColor = parsedColor;
      if (currentFontName) {
        colorByFont.set(currentFontName, currentHexColor);
      }
    }

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
        if (currentHexColor) {
          colorByFont.set(currentFontName, currentHexColor);
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
        color: currentHexColor,
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

      let color = opIdx < opSpans.length ? opSpans[opIdx].color : undefined;
      if (!color && fontName && colorByFont.has(fontName)) {
        color = colorByFont.get(fontName);
      }
      if (!color) {
        color = currentHexColor;
      }

      hints.set(itemIdx, {
        charSpacing,
        fontName: fontName || currentFontName,
        fontSize,
        color,
      });

      if (typeof item === "object" && item !== null) {
        item.charSpacing = charSpacing;
        if (color) {
          item.color = color;
        }
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
        color: opSpans[i].color,
      });
    }
  }

  return hints;
}


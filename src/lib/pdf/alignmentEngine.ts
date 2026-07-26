import type { FontMetrics } from "./fontMetrics";
import type { Viewport } from "./screen";

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height?: number;
  fontName?: string;
}

export interface AlignmentMetrics {
  domTop: number;
  domLeft: number;
  domHeight: number;
  domWidth: number;
  domLineHeight: number;
  domPaddingTop: number;
  initialScaleX: number;
  fontHeight: number;
  ascentRatio: number;
  angle: number;
}

export function transformMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

let canvasContext: CanvasRenderingContext2D | null = null;

function getTextWidth(text: string, fontSpec: string): number {
  if (typeof document === "undefined") return 0;
  if (!canvasContext) {
    try {
      const canvas = document.createElement("canvas");
      canvasContext = canvas.getContext("2d");
    } catch {
      /* ignore */
    }
  }
  if (canvasContext && typeof canvasContext.measureText === "function") {
    canvasContext.font = fontSpec;
    return canvasContext.measureText(text).width;
  }
  const match = fontSpec.match(/(\d+(?:\.\d+)?)px/);
  const fontSize = match ? Number(match[1]) : 14;
  return fontSize * 0.6 * text.length;
}

/**
 * Predicts text width directly from pdfFontMetrics.charWidths
 * without relying on canvas measurement fallbacks.
 */
export function predictWidthFromFontMetrics(
  text: string,
  fontHeight: number,
  pdfFontMetrics: FontMetrics | null | undefined
): number | null {
  if (!text || !fontHeight || !pdfFontMetrics || !pdfFontMetrics.charWidths) {
    return null;
  }

  const { charWidths, unitsPerEm = 1000 } = pdfFontMetrics;
  let totalWidthEm = 0;
  let count = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);
    let w: number | undefined;

    if (Array.isArray(charWidths)) {
      w = charWidths[code] ?? charWidths[i];
    } else if (typeof charWidths === "object" && charWidths !== null) {
      w = (charWidths as Record<string, number>)[ch] ??
          (charWidths as Record<string, number>)[code] ??
          (charWidths as Record<string, number>)[String(code)];
    }

    if (typeof w === "number" && !isNaN(w) && w > 0) {
      totalWidthEm += w;
      count++;
    }
  }

  if (count === 0 || totalWidthEm <= 0) return null;

  if (count < text.length) {
    const avgWidthEm = totalWidthEm / count;
    totalWidthEm += avgWidthEm * (text.length - count);
  }

  return (totalWidthEm / unitsPerEm) * fontHeight;
}

/**
 * Converts a PDF baseline into the DOM top coordinate while accounting for
 * CSS line-height leading and vertical padding.
 */
export function computeDomTopFromBaseline(
  baselineY: number,
  fontHeight: number,
  ascentRatio: number,
  lineHeight: number = 1,
  paddingTop: number = 0,
): number {
  const leading = (fontHeight * Math.max(0, lineHeight - 1)) / 2;
  return baselineY - fontHeight * ascentRatio - leading - paddingTop;
}

/**
 * Computes subpixel-precise alignment metrics for a PDF text item.
 */
export function computeAlignmentMetrics(
  item: TextItemLike,
  viewport: Viewport | { transform: number[]; scale: number },
  pdfFontMetrics: FontMetrics | null,
  fontFamily: string = "sans-serif"
): AlignmentMetrics {
  const vpTransform = (viewport as any).transform || [1, 0, 0, 1, 0, 0];
  const tx = transformMatrix(vpTransform, item.transform);

  const fontHeight = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12;
  const itemScaleX = Math.hypot(item.transform[0], item.transform[1]);
  const txScaleX = Math.hypot(tx[0], tx[1]);
  const scale = itemScaleX > 0 ? txScaleX / itemScaleX : (viewport.scale || 1);

  let exactDomAscentRatio = pdfFontMetrics?.ascentRatio ?? 0.8;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx && typeof ctx.measureText === "function") {
      ctx.font = `${fontHeight}px ${fontFamily}`;
      const metrics = ctx.measureText("M");
      if (metrics) {
        const ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
        const descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;
        if (ascent && (ascent + descent > 0)) {
          exactDomAscentRatio = ascent / (ascent + descent);
        }
      }
    }
  }

  // Baseline shift compensation: PDF.js text layer span top is positioned relative to baseline (tx[5]).
  // Using domTop = tx[5] - fontHeight * exactDomAscentRatio anchors domTop to the exact typographic baseline.
  const domTop = computeDomTopFromBaseline(tx[5], fontHeight, exactDomAscentRatio);

  const domLeft = tx[4];
  const domHeight = fontHeight;
  const domWidth = item.width * scale;
  const domLineHeight = fontHeight;
  const domPaddingTop = 0;
  const angle = Math.atan2(tx[1], tx[0]);

  let initialScaleX = 1;
  if (item.str && domWidth > 0) {
    const predictedWidth = predictWidthFromFontMetrics(item.str, fontHeight, pdfFontMetrics);
    let measuredWidth = predictedWidth ?? 0;

    if (!measuredWidth) {
      const fontSpec = `${fontHeight}px ${fontFamily}`;
      measuredWidth = getTextWidth(item.str, fontSpec);
    }

    if (measuredWidth > 0) {
      initialScaleX = domWidth / measuredWidth;
    }
  }

  return {
    domTop,
    domLeft,
    domHeight,
    domWidth,
    domLineHeight,
    domPaddingTop,
    initialScaleX,
    fontHeight,
    ascentRatio: exactDomAscentRatio,
    angle,
  };
}

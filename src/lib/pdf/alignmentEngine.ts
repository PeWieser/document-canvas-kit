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

  const ascentRatio = pdfFontMetrics?.ascentRatio ?? 0.8;
  const domTop = tx[5] - fontHeight * ascentRatio;
  const domLeft = tx[4];
  const domHeight = fontHeight;
  const domWidth = item.width * scale;
  const domLineHeight = fontHeight;
  const domPaddingTop = 0;
  const angle = Math.atan2(tx[1], tx[0]);

  let initialScaleX = 1;
  if (item.str && domWidth > 0) {
    const fontSpec = `${fontHeight}px ${fontFamily}`;
    const measuredWidth = getTextWidth(item.str, fontSpec);
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
    ascentRatio,
    angle,
  };
}

import type { Rect } from "./types";

// A pdf.js PageViewport (scale applied). We only rely on the two convert
// helpers so we stay rotation-safe.
export interface Viewport {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[];
  convertToPdfPoint: (x: number, y: number) => number[];
}

export function screenRect(r: Rect, vp: Viewport) {
  const a = vp.convertToViewportPoint(r.x, r.y);
  const b = vp.convertToViewportPoint(r.x + r.w, r.y + r.h);
  const left = Math.min(a[0], b[0]);
  const top = Math.min(a[1], b[1]);
  return { left, top, width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
}

export function screenPoint(x: number, y: number, vp: Viewport) {
  const p = vp.convertToViewportPoint(x, y);
  return { x: p[0], y: p[1] };
}

export function pdfPoint(sx: number, sy: number, vp: Viewport): [number, number] {
  const p = vp.convertToPdfPoint(sx, sy);
  return [p[0], p[1]];
}

export function rectFromPdfPoints(p1: [number, number], p2: [number, number]): Rect {
  const x = Math.min(p1[0], p2[0]);
  const y = Math.min(p1[1], p2[1]);
  return { x, y, w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) };
}

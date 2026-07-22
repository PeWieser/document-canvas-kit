import { useCallback, useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { toast } from "sonner";
import { GripVertical, X, MessageSquare, Check, Move } from "lucide-react";
import type { PdfDocumentProxy, PdfPageProxy } from "@/lib/pdf/pdfjs";
import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Annotation, Rect, TextReplaceAnno, TextboxAnno } from "@/lib/pdf/types";
import { resolvePDFCoreFontName, loadWebFont, cssFontStack } from "@/lib/pdf/fontDetect";
import { screenRect, pdfPoint, rectFromPdfPoints, type Viewport } from "@/lib/pdf/screen";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

import { extractSubsetFontsPaths, isFontWorkerReady, subscribeToWorkerReady, matchSingleFontOnPage } from "@/lib/pdf/fontVectorMatch";
import { getFontInfo, type FontInfo } from "@/lib/pdf/fontIntrospect";
import bunnyFamilies from "@/lib/pdf/font-families.json";
import { detectParagraphs } from "@/lib/pdf/paragraphGroup";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  color?: Uint8ClampedArray | number[];
}

function rgbToHex(color: Uint8ClampedArray | number[] | undefined): string {
  if (!color) return "#111111";
  let r = color[0] ?? 0;
  let g = color[1] ?? 0;
  let b = color[2] ?? 0;
  
  if (r <= 1 && g <= 1 && b <= 1 && (r > 0 || g > 0 || b > 0)) {
    r = Math.round(r * 255);
    g = Math.round(g * 255);
    b = Math.round(b * 255);
  } else {
    r = Math.round(r);
    g = Math.round(g);
    b = Math.round(b);
  }
  
  const toHex = (c: number) => {
    const hex = Math.max(0, Math.min(255, c)).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function isGarbageFontName(name: string | undefined | null): boolean {
  if (!name) return true;
  const cleanName = name.replace(/^[A-Z]{6}\+/, "").replace(/,.*$/, "").replace(/-\d+$/g, "").trim();
  return (
    !cleanName ||
    /^\d+$/.test(cleanName) ||
    /^[A-Za-z]{1,3}\d+[A-Za-z0-9]*$/.test(cleanName) ||
    /^[a-z]_[a-z]\d+_[a-z]\d+$/.test(cleanName)
  );
}

interface Props {
  doc: PdfDocumentProxy;
  pageId: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function smooth(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    out.push([(px + 2 * x + nx) / 4, (py + 2 * y + ny) / 4]);
  }
  out.push(points[points.length - 1]);
  return out;
}

function strokeToPath(stroke: number[][]): string {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"] as (string | number)[],
  );
  d.push("Z");
  return d.join(" ");
}

function mul(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function transformMatrix(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function getBoundingBoxInPdfSpace(A: number[], width: number): Rect {
  const scaleX = Math.hypot(A[0], A[1]);
  const cosAngle = scaleX > 0 ? A[0] / scaleX : 1;
  const sinAngle = scaleX > 0 ? A[1] / scaleX : 0;

  const x_bl = A[4];
  const y_bl = A[5];

  const x_br = A[4] + width * cosAngle;
  const y_br = A[5] + width * sinAngle;

  const x_tl = A[4] + A[2];
  const y_tl = A[5] + A[3];

  const x_tr = A[4] + width * cosAngle + A[2];
  const y_tr = A[5] + width * sinAngle + A[3];

  const x_min = Math.min(x_bl, x_br, x_tl, x_tr);
  const y_min = Math.min(y_bl, y_br, y_tl, y_tr);
  const x_max = Math.max(x_bl, x_br, x_tl, x_tr);
  const y_max = Math.max(y_bl, y_br, y_tl, y_tr);

  return {
    x: x_min,
    y: y_min,
    w: x_max - x_min,
    h: y_max - y_min,
  };
}

/** Detect raster image placements (PDF-space rects) via the operator list. */
async function detectImages(page: any): Promise<Rect[]> {
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack: number[][] = [];
    const rects: Rect[] = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = mul(args as number[], ctm);
      else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageXObjectRepeat ||
        fn === OPS.paintInlineImageXObject
      ) {
        const corners = [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
        const xs = corners.map((c) => c[0]);
        const ys = corners.map((c) => c[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        const w = Math.max(...xs) - x;
        const h = Math.max(...ys) - y;
        if (w > 8 && h > 8) rects.push({ x, y, w, h });
      }
    }
    return rects;
  } catch {
    return [];
  }
}

async function extractTextColors(page: any): Promise<number[][]> {
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    
    let currentRGB = [0, 0, 0];
    const textColors: number[][] = [];
    
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      
      if (fn === OPS.setFillRGBColor || fn === OPS.setStrokeRGBColor) {
        currentRGB = [args[0], args[1], args[2]];
      } else if (fn === OPS.setFillGray || fn === OPS.setStrokeGray) {
        const g = Math.round(args[0] * 255);
        currentRGB = [g, g, g];
      } else if (
        fn === OPS.setFillColor ||
        fn === OPS.setFillColorN ||
        fn === OPS.setStrokeColor ||
        fn === OPS.setStrokeColorN
      ) {
        if (args.length === 4) {
          const c = args[0];
          const m = args[1];
          const y = args[2];
          const k = args[3];
          const r = Math.round(255 * (1 - c) * (1 - k));
          const g = Math.round(255 * (1 - m) * (1 - k));
          const b = Math.round(255 * (1 - y) * (1 - k));
          currentRGB = [r, g, b];
        } else if (args.length === 3) {
          currentRGB = [
            Math.round(args[0] * 255),
            Math.round(args[1] * 255),
            Math.round(args[2] * 255),
          ];
        } else if (args.length === 1) {
          const g = Math.round(args[0] * 255);
          currentRGB = [g, g, g];
        }
      } else if (
        fn === OPS.showText ||
        fn === OPS.showSpans ||
        fn === OPS.showTextGL
      ) {
        textColors.push(currentRGB);
      }
    }
    return textColors;
  } catch (err) {
    console.warn("Failed to extract text colors from operators:", err);
    return [];
  }
}

export let globalFontMapping: Record<string, any> = {};
export let globalFontInfo: Record<string, FontInfo> = {};
export let globalFontRealNames: Record<string, string> = {};
export let globalFontMatchingPromises: Record<number, Promise<any>> = {};

export function clearGlobalFontCache() {
  globalFontMapping = {};
  globalFontInfo = {};
  globalFontRealNames = {};
  globalFontMatchingPromises = {};
}

const globalPageColors = new WeakMap<any, number[][]>();

export function PageView({ doc, pageId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [pdfPage, setPdfPage] = useState<PdfPageProxy | null>(null);
  const [items, setItems] = useState<TextItem[]>([]);
  const [imageRects, setImageRects] = useState<Rect[]>([]);
  const fontRealNames = useRef<Record<string, string>>({});
  const replaceRectRef = useRef<Rect | null>(null);
  const [hoverCursor, setHoverCursor] = useState<string | null>(null);
  const [workerLoading, setWorkerLoading] = useState(false);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [progress, setProgress] = useState(0);

  const zoom = useEditor((s) => s.zoom);
  const tool = useEditor((s) => s.tool);
  const color = useEditor((s) => s.color);
  const highlightColor = useEditor((s) => s.highlightColor);
  const fontSize = useEditor((s) => s.fontSize);

  // Synchronous viewport derived directly from pdfPage and zoom (zero-lag, no jitter)
  const viewport = pdfPage ? (pdfPage.getViewport({ scale: zoom }) as unknown as Viewport) : null;

  // Re-trigger layout measurement when web fonts complete loading
  const [, setFontCount] = useState(0);
  useEffect(() => {
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        setFontCount((c) => c + 1);
      });
    }
  }, []);
  const defaultFontFamily = useEditor((s) => s.defaultFontFamily);
  const setDefaultFontFamily = useEditor((s) => s.setDefaultFontFamily);
  const penSize = useEditor((s) => s.penSize);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const pushHistorySnapshot = useEditor((s) => s.pushHistorySnapshot);
  const select = useEditor((s) => s.select);
  const setFingerprints = useEditor((s) => s.setFingerprints);
  const { t } = useI18n();

  const pageAnnos = annotations.filter((a) => a.page === pageId);

  // --- Subscribe to SQLite Worker initialization progress/ready status ---
  useEffect(() => {
    if (isFontWorkerReady()) {
      setWorkerLoading(false);
      setShowProgressBar(false);
      return;
    }

    if (tool === "edit-text") {
      setWorkerLoading(true);
      
      // If loading takes longer than 1 second, show progress bar
      const pBarTimeout = setTimeout(() => {
        setShowProgressBar(true);
      }, 1000);

      // Simulate loading progress
      const startTime = Date.now();
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const estimatedProgress = Math.min(Math.round((elapsed / 3000) * 100), 95);
        setProgress(estimatedProgress);
      }, 100);

      const unsubscribe = subscribeToWorkerReady(() => {
        clearTimeout(pBarTimeout);
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => {
          setWorkerLoading(false);
          setShowProgressBar(false);
        }, 300);
      });

      return () => {
        clearTimeout(pBarTimeout);
        clearInterval(interval);
        unsubscribe();
      };
    }
  }, [tool]);

  // --- load page data ---
  useEffect(() => {
    setPdfPage(null);
    setItems([]);
    setImageRects([]);

    // Using module-level global font cache.

    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageId + 1);
      if (cancelled) return;
      setPdfPage(page);

      // Extract text content only (fast, doesn't parse graphics)
      const content = await page.getTextContent();
      if (cancelled) return;
      
      const its: TextItem[] = [];
      for (let i = 0; i < content.items.length; i++) {
        const it = content.items[i];
        if ("str" in it && it.str) {
          its.push({
            str: it.str,
            transform: it.transform as number[],
            width: it.width as number,
            height: it.height as number,
            fontName: (it as any).fontName,
            color: undefined, // Resolved lazily on-demand
          });
        }
      }
      setItems(its);

      // detect images (only needed for the select tool, but cheap to keep ready)
      const imgs = await detectImages(page);
      if (!cancelled) setImageRects(imgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageId]);

  // --- render page (double-buffered to eliminate white zoom flashes) ---
  useEffect(() => {
    if (!pdfPage || !viewport) return;
    let renderTask: any = null;

    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.floor(viewport.width * dpr);
      const targetH = Math.floor(viewport.height * dpr);

      // Smoothly scale the existing canvas via CSS during zoom transitions
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // Render to an off-screen canvas buffer
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = targetW;
      tempCanvas.height = targetH;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTask = pdfPage.render({ canvasContext: tempCtx, viewport: viewport as any });

      void renderTask.promise.then(() => {
        // Update backing store and copy buffer image in a single frame tick
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(tempCanvas, 0, 0);
        }
      }).catch(() => {
        /* task cancelled or interrupted */
      });
    }

    return () => {
      if (renderTask && typeof renderTask.cancel === "function") {
        renderTask.cancel();
      }
    };
  }, [pdfPage, zoom, viewport]);

  // --- position text-layer spans ---
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!layer || !viewport) return;
    for (const span of Array.from(layer.children) as HTMLElement[]) {
      const idx = Number(span.dataset.i);
      const item = items[idx];
      if (!item) continue;
      const tx = transformMatrix(
        (viewport as unknown as { transform: number[] }).transform,
        item.transform,
      );
      const fontHeight = Math.hypot(tx[2], tx[3]);
      const angle = Math.atan2(tx[1], tx[0]);
      const left = tx[4];
      const top = tx[5] - fontHeight;
      span.style.fontSize = `${fontHeight}px`;
      span.style.left = `${left}px`;
      span.style.top = `${top}px`;
      const target = item.width * zoom;
      const scaleX = span.offsetWidth > 0 ? target / span.offsetWidth : 1;
      span.style.transform = `rotate(${angle}rad) scaleX(${scaleX})`;
    }
  }, [items, viewport, zoom]);

  const getVp = () => viewport;

  const [draft, setDraft] = useState<Rect | null>(null);
  const penPtsRef = useRef<[number, number][]>([]);
  const [penScreen, setPenScreen] = useState<[number, number][]>([]);
  const startRef = useRef<[number, number] | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }[]>([]);

  const handleDragSnap = useCallback((rawRect: Rect, skip: boolean, ignoreId: string) => {
    if (skip || !viewport) {
      setSnapGuides([]);
      return rawRect;
    }
    // Work entirely in PDF coordinate space.
    // convertToPdfPoint(viewport.width, 0) gives the far-right edge of the page in PDF coords.
    const origin = viewport.convertToPdfPoint(0, 0);
    const farCorner = viewport.convertToPdfPoint(viewport.width, viewport.height);
    const pageLeft   = Math.min(origin[0], farCorner[0]);
    const pageRight  = Math.max(origin[0], farCorner[0]);
    const pageTop    = Math.max(origin[1], farCorner[1]);
    const pageBottom = Math.min(origin[1], farCorner[1]);
    const pageW = pageRight - pageLeft;
    const pageH = pageTop  - pageBottom;

    // Snap zone in PDF user-units (6 screen-pixels converted)
    const snapPt0 = viewport.convertToPdfPoint(0, 0);
    const snapPt1 = viewport.convertToPdfPoint(6, 0);
    const snapZone = Math.abs(snapPt1[0] - snapPt0[0]);

    let newX = rawRect.x;
    let newY = rawRect.y;
    const guides: { x?: number; y?: number }[] = [];

    const trySnapX = (target: number, current: number) => {
      if (Math.abs(target - current) < snapZone) {
        newX += target - current;
        guides.push({ x: target });
      }
    };
    const trySnapY = (target: number, current: number) => {
      if (Math.abs(target - current) < snapZone) {
        newY += target - current;
        guides.push({ y: target });
      }
    };

    // Page margins & center in PDF space
    trySnapX(pageLeft,          rawRect.x);
    trySnapX(pageRight,         rawRect.x + rawRect.w);
    trySnapX(pageLeft + pageW / 2, rawRect.x + rawRect.w / 2);

    trySnapY(pageBottom,        rawRect.y);
    trySnapY(pageTop,           rawRect.y + rawRect.h);
    trySnapY(pageBottom + pageH / 2, rawRect.y + rawRect.h / 2);

    // Other annotations on this page
    pageAnnos.forEach(a => {
      if (a.id === ignoreId || !("rect" in a)) return;
      const r = a.rect as Rect;
      if (r && typeof r.x === 'number') {
        trySnapX(r.x,           rawRect.x);
        trySnapX(r.x + r.w,    rawRect.x + rawRect.w);
        trySnapX(r.x + r.w / 2, rawRect.x + rawRect.w / 2);
        trySnapY(r.y,           rawRect.y);
        trySnapY(r.y + r.h,    rawRect.y + rawRect.h);
        trySnapY(r.y + r.h / 2, rawRect.y + rawRect.h / 2);
      }
    });

    setSnapGuides(guides);
    return { ...rawRect, x: newX, y: newY };
  }, [pageAnnos, viewport, zoom]);

  const localXY = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top] as [number, number];
  };

  const onOverlayPointerDown = (e: React.PointerEvent) => {
    const vp = getVp();
    if (!vp) return;
    if (tool === "select") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [sx, sy] = localXY(e);
    if (tool === "pen") {
      penPtsRef.current = [[sx, sy]];
      setPenScreen([[sx, sy]]);
      return;
    }
    if (tool === "comment") {
      const [px, py] = pdfPoint(sx, sy, vp);
      // If a pin already exists nearby, select it instead of creating a new one.
      // Note: the pin button itself also stops propagation, so this is a safety fallback.
      const existing = pageAnnos.find(
        (a) => a.kind === "comment" && Math.hypot(a.x - px, a.y - py) < 24 / zoom,
      );
      if (existing) {
        select(existing.id);
        return;
      }
      addAnnotation({
        id: uid(),
        kind: "comment",
        page: pageId,
        x: px,
        y: py,
        text: "",
        replies: [],
        resolved: false,
      } as Annotation);
      return;
    }
    if (tool === "textbox") {
      const [px, py] = pdfPoint(sx, sy, vp);
      addAnnotation({
        id: uid(),
        kind: "textbox",
        page: pageId,
        x: px,
        y: py,
        w: 180,
        h: fontSize * 2,
        text: "",
        fontSize,
        color,
        fontFamily: defaultFontFamily || "Helvetica",
      } as Annotation);
      return;
    }
    startRef.current = [sx, sy];
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const vp = getVp();
    if (!vp) return;
    const [sx, sy] = localXY(e);

    if (tool === "select") {
      const img = imageRectAt(sx, sy);
      if (img) {
        setHoverCursor("pointer");
      } else {
        const el = e.currentTarget as HTMLElement;
        const target = e.target as HTMLElement;
        if (target === el) {
          el.style.pointerEvents = "none";
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          el.style.pointerEvents = "auto";
          if (
            hit &&
            hit.tagName.toLowerCase() === "span" &&
            hit.parentElement?.classList.contains("pdf-text-layer")
          ) {
            setHoverCursor("text");
          } else {
            setHoverCursor(null);
          }
        } else {
          setHoverCursor(null);
        }
      }
    }

    if (tool === "pen" && penPtsRef.current.length) {
      penPtsRef.current.push([sx, sy]);
      setPenScreen([...penPtsRef.current]);
      return;
    }
    if (startRef.current && (tool === "redact" || tool === "highlight")) {
      const p1 = pdfPoint(startRef.current[0], startRef.current[1], vp);
      const p2 = pdfPoint(sx, sy, vp);
      setDraft(rectFromPdfPoints(p1, p2));
    }
  };

  const onOverlayPointerUp = () => {
    const vp = getVp();
    if (!vp) return;
    if (tool === "pen" && penPtsRef.current.length > 1) {
      const smoothed = smooth(penPtsRef.current);
      const pts = smoothed.map((p) => pdfPoint(p[0], p[1], vp));
      addAnnotation({
        id: uid(),
        kind: "pen",
        page: pageId,
        points: pts,
        color,
        size: penSize,
      } as Annotation);
      penPtsRef.current = [];
      setPenScreen([]);
      return;
    }
    if (draft && (draft.w > 2 || draft.h > 2)) {
      if (tool === "redact") {
        addAnnotation({ id: uid(), kind: "redact", page: pageId, rect: draft } as Annotation);
      } else if (tool === "highlight") {
        addAnnotation({
          id: uid(),
          kind: "highlight",
          page: pageId,
          rects: [draft],
          color: highlightColor,
        } as Annotation);
      }
    }
    setDraft(null);
    startRef.current = null;
  };

  // --- selection based highlight / redact (text layer) ---
  const onTextMouseUp = useCallback(() => {
    if (tool !== "highlight" && tool !== "redact") return;
    const vp = getVp();
    const sel = window.getSelection();
    if (!vp || !sel || sel.isCollapsed || !wrapRef.current) return;
    const base = wrapRef.current.getBoundingClientRect();
    const rects: Rect[] = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      for (const cr of Array.from(sel.getRangeAt(i).getClientRects())) {
        if (cr.width < 1 || cr.height < 1) continue;
        const p1 = pdfPoint(cr.left - base.left, cr.top - base.top, vp);
        const p2 = pdfPoint(cr.right - base.left, cr.bottom - base.top, vp);
        rects.push(rectFromPdfPoints(p1, p2));
      }
    }
    if (rects.length) {
      if (tool === "redact") {
        for (const r of rects) {
          addAnnotation({ id: uid(), kind: "redact", page: pageId, rect: r } as Annotation);
        }
      } else {
        addAnnotation({
          id: uid(),
          kind: "highlight",
          page: pageId,
          rects,
          color: highlightColor,
        } as Annotation);
      }
      sel.removeAllRanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, highlightColor, pageId, viewport]);

  // --- click a span to replace its text (font-aware) ---
  const replaceSpan = (idx: number) => {
    const vp = getVp();
    const item = items[idx];
    if (!vp || !item || !pdfPage) return;
    const rect = getBoundingBoxInPdfSpace(item.transform, item.width);

    // Primary path: embedded font bytes → deckungsgleich re-embed on export.
    let family = "Helvetica";
    let isBold = false;
    let isItalic = false;

    const cacheKey = item.fontName || "";
    const cachedInfo = cacheKey ? globalFontInfo[cacheKey] : undefined;

    // 1. Start with whatever the fontIntrospect cache already knows
    if (cachedInfo) {
      family = cachedInfo.family;
      isBold = cachedInfo.isBold;
      isItalic = cachedInfo.isItalic;
    }

    // 2. If a KNN match is already in cache, prefer it (more accurate)
    const knnMatch = cacheKey ? globalFontMapping[cacheKey] : null;
    if (knnMatch && knnMatch.family && knnMatch.family !== "Unknown") {
      family = knnMatch.family;
      isBold = knnMatch.isBold;
      isItalic = knnMatch.isItalic;
    }

    // 3. Only fall back to psname resolution if we still have a garbage/empty name
    if (isGarbageFontName(family) || !family) {
      const psName = (cacheKey && cachedInfo?.postscriptName) || item.fontName || "";
      const resolved = resolvePDFCoreFontName(psName);
      // Only accept the resolution if it gives us something better than Helvetica
      // (resolvePDFCoreFontName returns Helvetica as its own default, so only
      // override if our current family is also bad)
      family = resolved.family;
      isBold = resolved.isBold;
      isItalic = resolved.isItalic;
    }

    if (family) {
      void loadWebFont(family);
      setDefaultFontFamily(family);
    }

    const defaultColor = "#111111";
    const annoId = uid();

    // Detect if this item belongs to a multi-line paragraph group
    const paras = detectParagraphs(items);
    const para = paras.find((p) => p.lines.some((l) => l.itemIndices.includes(idx)));

    let paraBold = isBold;
    let paraItalic = isItalic;
    if (para && para.lines.length > 0) {
      for (const l of para.lines) {
        for (const i of l.itemIndices) {
          const it = items[i];
          if (it && it.fontName) {
            const info = globalFontInfo[it.fontName] || resolvePDFCoreFontName(it.fontName);
            if (info.isBold) paraBold = true;
            if (info.isItalic) paraItalic = true;
          }
        }
      }
    }

    if (para && para.lines.length > 1) {
      addAnnotation({
        id: annoId,
        kind: "textReplace",
        page: pageId,
        rect: para.bounds,
        text: para.fullText,
        fontSize: para.fontSize,
        color: defaultColor,
        fontFamily: family,
        bold: paraBold,
        italic: paraItalic,
        transform: para.transform,
        width: para.bounds.w,
        lineHeight: para.lineHeight,
        originalFontBytes: cachedInfo?.bytes,
      } as Annotation);
    } else {
      addAnnotation({
        id: annoId,
        kind: "textReplace",
        page: pageId,
        rect,
        text: item.str,
        fontSize: Math.hypot(item.transform[2], item.transform[3]),
        color: defaultColor,
        fontFamily: family,
        bold: isBold,
        italic: isItalic,
        transform: item.transform,
        width: item.width,
        lineHeight: item.height,
        originalFontBytes: cachedInfo?.bytes,
      } as Annotation);
    }

    // 1. Resolve page colors on-demand asynchronously
    let cachedColors = globalPageColors.get(pdfPage);
    const colorsPromise = cachedColors 
      ? Promise.resolve(cachedColors)
      : extractTextColors(pdfPage).then((colors) => {
          globalPageColors.set(pdfPage, colors);
          return colors;
        });

    void colorsPromise.then((colors) => {
      let col = [0, 0, 0];
      if (colors.length > 0) {
        const colorIdx = colors.length === items.length
          ? idx
          : Math.min(colors.length - 1, Math.floor((idx / items.length) * colors.length));
        col = colors[colorIdx];
      }
      const textColor = rgbToHex(col);
      updateAnnotation(annoId, { color: textColor } as Partial<Annotation>);
    }).catch(() => {
      // keep default color if extraction fails
    });
    // 2. Resolve font matching on-demand asynchronously
    if (item.fontName && !cachedInfo) {
      const cacheKey = item.fontName || "";
      void getFontInfo(pdfPage, item.fontName).then((info) => {
        globalFontInfo[cacheKey] = info;
        let fam = info.family;
        let bld = info.isBold;
        let itl = info.isItalic;
        if (isGarbageFontName(fam)) {
          const resolved = resolvePDFCoreFontName(item.fontName);
          fam = resolved.family;
          bld = resolved.isBold;
          itl = resolved.isItalic;
        }
        if (fam) {
          void loadWebFont(fam);
          setDefaultFontFamily(fam);
          updateAnnotation(annoId, {
            fontFamily: fam,
            bold: bld,
            italic: itl,
            originalFontBytes: info.bytes,
          } as Partial<Annotation>);
        }
      }).catch(() => {});

      void matchSingleFontOnPage(pdfPage, item.fontName).then((knnMatch) => {
        if (knnMatch && knnMatch.family !== "Unknown") {
          globalFontMapping[cacheKey] = knnMatch;
        }

        const matchedFamily = knnMatch && knnMatch.family !== "Unknown" ? knnMatch.family : info.family;
        const matchedBold = knnMatch ? knnMatch.isBold : info.isBold;
        const matchedItalic = knnMatch ? knnMatch.isItalic : info.isItalic;

        updateAnnotation(annoId, {
          fontFamily: matchedFamily,
          bold: matchedBold,
          italic: matchedItalic,
          originalFontBytes: info.bytes,
          weight: info.weight,
          italicAngle: info.italicAngle,
        } as Partial<Annotation>);
        void loadWebFont(matchedFamily);
        setDefaultFontFamily(matchedFamily);
        toast.success(
          `${matchedFamily}${matchedBold ? " Bold" : ""}${matchedItalic ? " Italic" : ""} (${info.source})`,
          { id: `font-match-${item.fontName}` }
        );

        // Check local system fonts permission if the font is not in the Bunny Font library
        const isBunnyFont = bunnyFamilies.includes(matchedFamily);
        if (!isBunnyFont && 'queryLocalFonts' in window) {
          navigator.permissions.query({ name: 'local-fonts' as any }).then((result) => {
            if (result.state === 'prompt') {
              toast.info(
                `Schriftart '${matchedFamily}' ist eine Systemschrift. Erlauben Sie Zugriff auf lokale Systemschriftarten, um diese zu nutzen.`,
                {
                  action: {
                    label: "Zulassen",
                    onClick: async () => {
                      try {
                        await (window as any).queryLocalFonts();
                        toast.success("Zugriff auf Systemschriftarten erlaubt!");
                      } catch (err) {
                        toast.error("Zugriff verweigert.");
                      }
                    }
                  },
                  duration: 8000
                }
              );
            } else if (result.state === 'granted') {
              // Try to query to make sure it's available
              (window as any).queryLocalFonts().catch(() => {});
            }
          }).catch(() => {
            // navigator.permissions might throw in some configurations, fallback directly to call
            (window as any).queryLocalFonts().catch(() => {});
          });
        }
      }).catch((err) => {
        console.warn("[replaceSpan] Async font match failed:", err);
      });
    } else if (cachedInfo) {
      toast.success(`Erkannt: ${family}`);
    }
  };

  const onSpanClick = (idx: number) => {
    if (tool !== "edit-text") return;
    replaceSpan(idx);
  };

  // --- context menu actions ---
  const menuPtRef = useRef<[number, number] | null>(null);
  const onContextMenu = (e: React.MouseEvent) => {
    menuPtRef.current = localXY(e);
  };

  const imageRectAt = (sx: number, sy: number): Rect | null => {
    const vp = getVp();
    if (!vp) return null;
    const [px, py] = pdfPoint(sx, sy, vp);
    for (const r of imageRects) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return r;
    }
    return null;
  };

  const ctxAddTextHere = () => {
    const vp = getVp();
    const pt = menuPtRef.current;
    if (!vp || !pt) return;
    const [px, py] = pdfPoint(pt[0], pt[1], vp);
    addAnnotation({
      id: uid(),
      kind: "textbox",
      page: pageId,
      x: px,
      y: py,
      w: 200,
      h: fontSize * 2,
      text: "",
      fontSize,
      color,
      fontFamily: defaultFontFamily || "Helvetica",
    } as Annotation);
  };

  const ctxRedactHere = () => {
    const vp = getVp();
    const pt = menuPtRef.current;
    if (!vp || !pt) return;
    // 1) Prefer an active text selection → redact each fragment.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && wrapRef.current) {
      const base = wrapRef.current.getBoundingClientRect();
      let any = false;
      for (let i = 0; i < sel.rangeCount; i++) {
        for (const cr of Array.from(sel.getRangeAt(i).getClientRects())) {
          if (cr.width < 1 || cr.height < 1) continue;
          const p1 = pdfPoint(cr.left - base.left, cr.top - base.top, vp);
          const p2 = pdfPoint(cr.right - base.left, cr.bottom - base.top, vp);
          addAnnotation({
            id: uid(),
            kind: "redact",
            page: pageId,
            rect: rectFromPdfPoints(p1, p2),
          } as Annotation);
          any = true;
        }
      }
      if (any) {
        sel.removeAllRanges();
        return;
      }
    }
    // 2) Fallback: redact the image under the cursor, or a small default box.
    const img = imageRectAt(pt[0], pt[1]);
    const rect = img ?? {
      x: pdfPoint(pt[0], pt[1], vp)[0] - 40,
      y: pdfPoint(pt[0], pt[1], vp)[1] - 8,
      w: 80,
      h: 16,
    };
    addAnnotation({ id: uid(), kind: "redact", page: pageId, rect } as Annotation);
  };

  const ctxCopy = () => {
    const sel = window.getSelection()?.toString();
    if (sel) {
      navigator.clipboard?.writeText(sel);
      toastCopied();
    }
  };

  const ctxReplaceImage = () => {
    const pt = menuPtRef.current;
    if (!pt) return;
    replaceRectRef.current = imageRectAt(pt[0], pt[1]);
    replaceInputRef.current?.click();
  };

  const onReplaceFile = (file: File | undefined) => {
    if (!file) return;
    const rect = replaceRectRef.current;
    if (!rect) return;
    const reader = new FileReader();
    reader.onload = () => {
      addAnnotation({
        id: uid(),
        kind: "image",
        page: pageId,
        rect,
        dataUrl: String(reader.result),
      } as Annotation);
    };
    reader.readAsDataURL(file);
  };

  const textInteractive =
    tool === "highlight" || tool === "edit-text" || tool === "redact" || tool === "select";
  // Overlay handles pointer events for drawing tools and comment placement.
  // select tool also needs overlay to be interactive for existing annotation drag/resize handles.
  const overlayInteractive =
    tool === "pen" || tool === "textbox" || tool === "comment" || tool === "select";

  const cursor =
    hoverCursor && tool === "select"
      ? hoverCursor
      : tool === "pen"
        ? "crosshair"
        : tool === "textbox" || tool === "comment"
          ? "copy"
          : "default";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={wrapRef}
          className="relative shadow-lg ring-1 ring-black/5"
          style={{ width: viewport?.width, height: viewport?.height, background: "white" }}
          onContextMenu={onContextMenu}
        >
          <canvas ref={canvasRef} className="block" />
          {workerLoading && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center pointer-events-auto">
              <div className="flex flex-col items-center gap-4 max-w-xs px-4">
                {showProgressBar ? (
                  <>
                    <div className="text-sm font-semibold text-gray-700 animate-pulse text-center">
                      Schrifterkennungs-Datenbank wird geladen...
                    </div>
                    <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300 ease-out" 
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 font-medium">{progress}%</div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <div className="text-sm font-medium text-gray-600 animate-pulse">Lade Schriftanalyse...</div>
                  </>
                )}
              </div>
            </div>
          )}
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onReplaceFile(e.target.files?.[0])}
          />

          {/* text layer */}
          <div
            ref={textLayerRef}
            className="pdf-text-layer"
            style={{ pointerEvents: textInteractive ? "auto" : "none" }}
            onMouseUp={onTextMouseUp}
          >
            {items.map((it, i) => (
              <span
                key={i}
                data-i={i}
                onClick={() => onSpanClick(i)}
                style={{ cursor: tool === "edit-text" || tool === "redact" ? "text" : undefined }}
                onMouseEnter={() => {
                  if (tool === "edit-text" && it.fontName && !globalFontInfo[it.fontName] && pdfPage) {
                    getFontInfo(pdfPage, it.fontName).then(info => {
                      globalFontInfo[it.fontName] = info;
                    }).catch(() => {});
                    matchSingleFontOnPage(pdfPage, it.fontName).then(mapping => {
                      if (mapping) globalFontMapping[it.fontName] = mapping;
                    }).catch(() => {});
                  }
                }}
              >
                {it.str}
              </span>
            ))}
          </div>

          {/* image outlines (select tool) */}
          {tool === "select" &&
            viewport &&
            imageRects.map((r, i) => {
              const s = screenRect(r, viewport);
              const isSelected = selectedId === `img-${i}`;
              return (
                <div
                  key={`img-${i}`}
                  className={cn(
                    "absolute border border-dashed transition-all",
                    isSelected
                      ? "border-primary ring-2 ring-primary/30 z-20"
                      : "border-transparent hover:border-primary/40 cursor-pointer z-10",
                  )}
                  style={{ ...s, pointerEvents: "auto" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    select(`img-${i}`);
                  }}
                >
                  {isSelected && (
                    <div
                      className="absolute right-0 top-0 -translate-y-full flex gap-1 bg-background border shadow-md rounded-md p-1 z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          replaceRectRef.current = r;
                          replaceInputRef.current?.click();
                        }}
                        className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 font-medium cursor-pointer"
                      >
                        {t("ctxReplaceImage") || "Ersetzen"}
                      </button>
                      <button
                        onClick={() => {
                          addAnnotation({
                            id: uid(),
                            kind: "redact",
                            page: pageId,
                            rect: r,
                          } as Annotation);
                          select(null);
                        }}
                        className="text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 font-medium cursor-pointer"
                      >
                        {t("delete") || "Löschen"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {/* CROP TOOL overlay: interactive frame, dim outside, 8 handles + move */}
          {tool === "crop" && viewport && <CropOverlay pageId={pageId} vp={viewport} />}

          {/* overlay (annotations + creation) */}
          <div
            className="absolute inset-0"
            style={{
              pointerEvents:
                tool === "select" || tool === "crop"
                  ? "none"
                  : overlayInteractive
                    ? "auto"
                    : "none",
              cursor,
            }}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onPointerLeave={() => setHoverCursor(null)}
          >
            {viewport &&
              pageAnnos.map((a) => (
                <AnnoView
                  key={a.id}
                  anno={a}
                  vp={viewport}
                  zoom={zoom}
                  selected={selectedId === a.id}
                  tool={tool}
                  onSelect={() => select(a.id)}
                  onUpdate={(patch, commitToHistory) => updateAnnotation(a.id, patch, commitToHistory)}
                  onRemove={() => removeAnnotation(a.id)}
                  t={t}
                  onDragSnap={handleDragSnap}
                />
              ))}

            {snapGuides.map((g, i) => {
              if (!viewport) return null;
              const xScreen = g.x !== undefined ? viewport.convertToViewportPoint(g.x, 0)[0] : undefined;
              const yScreen = g.y !== undefined ? viewport.convertToViewportPoint(0, g.y)[1] : undefined;
              return (
                <svg key={`guide-${i}`} className="absolute inset-0 h-full w-full pointer-events-none z-50">
                  {xScreen !== undefined && (
                    <line x1={xScreen} y1={0} x2={xScreen} y2="100%" stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" />
                  )}
                  {yScreen !== undefined && (
                    <line x1={0} y1={yScreen} x2="100%" y2={yScreen} stroke="#3b82f6" strokeWidth={1} strokeDasharray="2 2" />
                  )}
                </svg>
              );
            })}

            {viewport && draft && (
              <div
                className={cn(
                  "absolute border-2",
                  tool === "redact" ? "bg-black/80 border-destructive" : "border-primary",
                )}
                style={{
                  ...screenRect(draft, viewport),
                  background:
                    tool === "highlight"
                      ? `color-mix(in srgb, ${highlightColor} 45%, transparent)`
                      : undefined,
                }}
              />
            )}

            {penScreen.length > 1 && (
              <svg className="absolute inset-0 h-full w-full pointer-events-none">
                <path
                  d={strokeToPath(
                    getStroke(penScreen, { size: penSize * zoom, thinning: 0.5, streamline: 0.5 }),
                  )}
                  fill={color}
                />
              </svg>
            )}
          </div>

        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onClick={() => {
            // find nearest span to right-click and replace it
            const pt = menuPtRef.current;
            if (!pt || !viewport) return;
            const base = wrapRef.current!.getBoundingClientRect();
            const el = document.elementFromPoint(
              base.left + pt[0],
              base.top + pt[1],
            ) as HTMLElement | null;
            const di = el?.dataset?.i;
            if (di != null) replaceSpan(Number(di));
          }}
        >
          {t("ctxEditText")}
        </ContextMenuItem>
        <ContextMenuItem onClick={ctxRedactHere}>{t("ctxRedact")}</ContextMenuItem>
        <ContextMenuItem onClick={ctxReplaceImage}>{t("ctxReplaceImage")}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={ctxCopy}>{t("ctxCopy")}</ContextMenuItem>
        <ContextMenuItem onClick={ctxAddTextHere}>{t("ctxAddText")}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function toastCopied() {
  toast.success("✓");
}

let canvasContext: CanvasRenderingContext2D | null = null;
function getTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") return 0;
  if (!canvasContext) {
    try {
      const canvas = document.createElement("canvas");
      canvasContext = canvas.getContext("2d");
    } catch (e) {
      // Ignored in test environments
    }
  }
  if (canvasContext && typeof canvasContext.measureText === "function") {
    canvasContext.font = font;
    return canvasContext.measureText(text).width;
  }
  // Robust fallback for test environments without full canvas context support
  const match = font.match(/(\d+)px/);
  const fontSize = match ? Number(match[1]) : 14;
  return fontSize * 0.6 * text.length;
}

// ---- individual annotation rendering ----
function AnnoView({
  anno,
  vp,
  zoom,
  selected,
  tool,
  onSelect,
  onUpdate,
  onRemove,
  t,
  onDragSnap,
}: {
  anno: Annotation;
  vp: Viewport;
  zoom: number;
  selected: boolean;
  tool: string;
  onSelect: () => void;
  onUpdate: (patch: Partial<Annotation>, commitToHistory?: boolean) => void;
  onRemove: () => void;
  t: (k: any) => string;
  onDragSnap?: (rect: Rect, skip: boolean, ignoreId: string) => Rect;
}) {
  const selectable = tool === "select";
  const pushHistorySnapshot = useEditor((s) => s.pushHistorySnapshot);
  const dragStartRect = useRef<Rect | null>(null);
  const dragStartTransform = useRef<number[] | null>(null);

  if (anno.kind === "highlight") {
    return (
      <>
        {anno.rects.map((r, i) => {
          const s = screenRect(r, vp);
          return (
            <div
              key={i}
              onClick={selectable ? onSelect : undefined}
              className={cn("absolute rounded-[2px]", selected && "ring-2 ring-primary")}
              style={{
                ...s,
                background: `color-mix(in srgb, ${anno.color} 45%, transparent)`,
                mixBlendMode: "multiply",
                pointerEvents: selectable ? "auto" : "none",
              }}
            />
          );
        })}
        {selected && <DeleteBtn rect={screenRect(anno.rects[0], vp)} onRemove={onRemove} />}
      </>
    );
  }

  if (anno.kind === "redact") {
    const s = screenRect(anno.rect, vp);
    return (
      <div
        onClick={selectable ? onSelect : undefined}
        className={cn("absolute bg-black", selected && "ring-2 ring-destructive")}
        style={{ ...s, pointerEvents: selectable ? "auto" : "none" }}
      >
        {selected && (
          <DeleteBtn
            rect={{ left: 0, top: 0, width: s.width, height: s.height }}
            onRemove={onRemove}
            inner
          />
        )}
      </div>
    );
  }

  if (anno.kind === "image") {
    const s = screenRect(anno.rect, vp);
    return (
      <div
        onClick={selectable ? onSelect : undefined}
        className={cn("absolute", selected && "ring-2 ring-primary")}
        style={{ ...s, pointerEvents: selectable || selected ? "auto" : "none" }}
      >
        <img src={anno.dataUrl} alt="" className="h-full w-full object-fill" draggable={false} />
         {selected && (
          <>
            <MoveHandle
              onDragStart={() => {
                pushHistorySnapshot();
                if ("rect" in anno) dragStartRect.current = anno.rect;
              }}
              onDragEnd={() => {
                if (onDragSnap && "rect" in anno) onDragSnap(anno.rect, true, anno.id);
              }}
              onMove={(dxS, dyS, dxTotal, dyTotal) => {
                if (!dragStartRect.current) return;
                const p0 = vp.convertToPdfPoint(0, 0);
                const p1 = vp.convertToPdfPoint(dxTotal, dyTotal);
                const rawRect = {
                  ...dragStartRect.current,
                  x: dragStartRect.current.x + (p1[0] - p0[0]),
                  y: dragStartRect.current.y + (p1[1] - p0[1]),
                };
                const snapped = onDragSnap ? onDragSnap(rawRect, false, anno.id) : rawRect;
                onUpdate({ rect: snapped } as any, false);
              }}
            />
            <ResizeHandle
              onDragStart={pushHistorySnapshot}
              onResize={(dxS, dyS) => {
                const p0 = vp.convertToPdfPoint(0, 0);
                const p1 = vp.convertToPdfPoint(dxS, dyS);
                const dw = p1[0] - p0[0];
                const dh = p1[1] - p0[1];
                onUpdate({
                  rect: {
                    x: anno.rect.x,
                    y: anno.rect.y - -dh < 0 ? anno.rect.y : anno.rect.y - -dh,
                    w: Math.max(10, anno.rect.w + dw),
                    h: Math.max(10, anno.rect.h - dh),
                  },
                } as any, false);
              }}
            />
            <DeleteBtn
              rect={{ left: 0, top: 0, width: s.width, height: s.height }}
              onRemove={onRemove}
              inner
            />
          </>
        )}
      </div>
    );
  }

  if (anno.kind === "pen") {
    const pts = anno.points.map((p) => {
      const sp = vp.convertToViewportPoint(p[0], p[1]);
      return [sp[0], sp[1]] as [number, number];
    });
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const bx = Math.min(...xs);
    const by = Math.min(...ys);
    const bw = Math.max(...xs) - bx;
    const bh = Math.max(...ys) - by;
    return (
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <path
          d={strokeToPath(
            getStroke(pts, { size: anno.size * zoom, thinning: 0.5, streamline: 0.5 }),
          )}
          fill={anno.color}
          onClick={selectable ? onSelect : undefined}
          style={{ pointerEvents: selectable ? "auto" : "none" }}
        />
        {selected && (
          <>
            <rect x={bx - 4} y={by - 4} width={bw + 8} height={bh + 8} fill="none" stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4 3" style={{ pointerEvents: "none" }} />
            <g onClick={onRemove} style={{ cursor: "pointer", pointerEvents: "auto" }}>
              <circle cx={pts[0][0]} cy={pts[0][1]} r={9} fill="hsl(0 72% 51%)" />
            </g>
          </>
        )}
      </svg>
    );
  }

  if (anno.kind === "textReplace" || anno.kind === "textbox") {
    const transform = anno.kind === "textReplace" ? (anno as TextReplaceAnno).transform : undefined;
    const annoWidth = anno.kind === "textReplace" ? (anno as TextReplaceAnno).width : undefined;
    const textboxX = anno.kind === "textbox" ? (anno as TextboxAnno).x : 0;
    const textboxY = anno.kind === "textbox" ? (anno as TextboxAnno).y : 0;

    const tx = transform
      ? transformMatrix(
          (vp as unknown as { transform: number[] }).transform,
          transform,
        )
      : transformMatrix((vp as unknown as { transform: number[] }).transform, [
          1,
          0,
          0,
          1,
          textboxX,
          textboxY,
        ]);

    const fontHeight = transform
      ? Math.hypot(tx[2], tx[3])
      : anno.fontSize * Math.hypot(tx[2], tx[3]);

    const annoLineHeight = anno.kind === "textReplace" ? (anno as TextReplaceAnno).lineHeight : undefined;
    let screenLineHeight = fontHeight;
    if (transform && annoLineHeight && annoLineHeight > 0) {
      const pdfFontHeight = Math.hypot(transform[2], transform[3]);
      if (pdfFontHeight > 0) {
        screenLineHeight = annoLineHeight * (fontHeight / pdfFontHeight);
      }
    }

    const left = tx[4];
    const top = transform ? tx[5] - fontHeight : tx[5];
    const angle = Math.atan2(tx[1], tx[0]);
    const origWidth = anno.kind === "textReplace"
      ? (transform
          ? (annoWidth ?? 0) * Math.hypot(tx[0], tx[1]) / Math.hypot(transform[0], transform[1])
          : (annoWidth ?? 0) * zoom)
      : (anno as TextboxAnno).w * Math.hypot(tx[0], tx[1]);

    const family = cssFontStack(anno.fontFamily || "");
    const isMultiline = anno.kind === "textReplace" && anno.text.includes("\n");
    const numLines = isMultiline ? anno.text.split("\n").length : 1;
    
    // For textReplace annotations, measure unscaled text width across ALL lines to prevent line-wrapping & right-clipping
    let containerWidth = origWidth;
    let textScaleX = 1;
    if (anno.kind === "textReplace") {
      const fontSpec = `${anno.italic ? "italic" : "normal"} ${anno.bold ? "bold" : "normal"} ${fontHeight}px ${family}`;
      const lines = anno.text.split("\n");
      let maxMeasured = 0;
      for (const lineText of lines) {
        const w = getTextWidth(lineText, fontSpec);
        if (w > maxMeasured) maxMeasured = w;
      }
      const pdfScreenWidth = transform ? (annoWidth ?? 0) * Math.hypot(tx[0], tx[1]) / Math.hypot(transform[0], transform[1]) : (annoWidth ?? 0) * zoom;
      textScaleX = maxMeasured > 0 && pdfScreenWidth > 0 ? pdfScreenWidth / maxMeasured : 1;
      containerWidth = Math.max(maxMeasured + 14, pdfScreenWidth);
    }

    const s = {
      left: `${left}px`,
      top: `${top}px`,
      width: anno.kind === "textReplace" ? `${containerWidth}px` : `${origWidth}px`,
    };
    let transformString = transform ? `rotate(${angle}rad)` : undefined;
    if (anno.kind === "textReplace" && !isMultiline) {
       transformString = transformString ? `${transformString} scaleX(${textScaleX})` : `scaleX(${textScaleX})`;
    }
    const transformOriginString = transform ? `0 0` : undefined;

    return (
      <div
        className={cn(
          "absolute group",
          selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
        )}
        style={{
          ...s,
          transform: transformString,
          transformOrigin: transformOriginString,
          minHeight: `${fontHeight}px`,
          height: "auto",
          pointerEvents: selectable || tool === "edit-text" || selected ? "auto" : "none",
          // hide the original glyph underneath as soon as the replacement exists
          background: anno.kind === "textReplace" ? "white" : undefined,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <textarea
          value={anno.text}
          onChange={(e) => {
            const el = e.target as HTMLTextAreaElement;
            if (anno.kind === "textbox" || isMultiline) {
              // auto-grow the box to fit its content
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            } else {
              el.style.height = `${Math.ceil(fontHeight * 1.2)}px`;
            }
            onUpdate({ text: el.value } as any);
          }}
          ref={(el) => {
            if (el) {
              if (anno.kind === "textbox" || isMultiline) {
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              } else {
                el.style.height = `${Math.ceil(fontHeight * 1.2)}px`;
              }
            }
          }}
          onFocus={onSelect}
          placeholder={anno.kind === "textbox" ? t("newTextbox") : ""}
          rows={anno.kind === "textReplace" ? numLines : undefined}
          className="w-full resize-none bg-transparent outline-none overflow-hidden"
          style={{
            fontSize: fontHeight,
            color: anno.color,
            fontFamily: family,
            fontWeight: anno.bold ? 700 : 400,
            fontStyle: anno.italic ? "italic" : "normal",
            lineHeight: anno.lineHeight ? (anno.lineHeight > 3 ? anno.lineHeight / anno.fontSize : anno.lineHeight) : 1.2,
            padding: 0,
            margin: 0,
            border: "none",
            display: "block",
            position: "relative",
            overflow: "hidden",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            whiteSpace: isMultiline ? "pre-wrap" : (anno.kind === "textReplace" ? "nowrap" : "pre-wrap"),
            wordBreak: "keep-all",
            overflowWrap: "normal",
            width: "100%",
          }}
        />
        {selected && (() => {
          const height = anno.kind === "textReplace" ? fontHeight : anno.h;
          const width = anno.kind === "textReplace" ? containerWidth : anno.w;
          const isSmall = height < 20 || width < 45;
          const isNarrow = width < 36;
          return (
            <>
              <MoveHandle
                className={isSmall ? (isNarrow ? "-left-4 -top-5" : "-left-1 -top-5") : undefined}
                onDragStart={() => {
                  pushHistorySnapshot();
                  if (anno.kind === "textbox") dragStartRect.current = { x: anno.x, y: anno.y, w: anno.w, h: 10 };
                  if (anno.kind === "textReplace") dragStartTransform.current = [...(anno as TextReplaceAnno).transform];
                }}
                onDragEnd={() => {
                  if (onDragSnap && anno.kind === "textbox") {
                    onDragSnap({ x: anno.x, y: anno.y, w: anno.w, h: 10 }, true, anno.id);
                  }
                  if (onDragSnap && anno.kind === "textReplace") {
                    const t = (anno as TextReplaceAnno).transform;
                    onDragSnap({ x: t[4], y: t[5], w: (anno as TextReplaceAnno).width || 50, h: fontHeight / zoom }, true, anno.id);
                  }
                }}
                onMove={(dxScreen, dyScreen, dxTotal, dyTotal) => {
                  const p0 = vp.convertToPdfPoint(0, 0);
                  const p1 = vp.convertToPdfPoint(dxTotal, dyTotal);
                  const dx = p1[0] - p0[0];
                  const dy = p1[1] - p0[1];
                  if (anno.kind === "textbox") {
                    if (!dragStartRect.current) return;
                    const rawRect = {
                      x: dragStartRect.current.x + dx,
                      y: dragStartRect.current.y + dy,
                      w: anno.w,
                      h: 10,
                    };
                    const snapped = onDragSnap ? onDragSnap(rawRect, false, anno.id) : rawRect;
                    onUpdate({ x: snapped.x, y: snapped.y } as any, false);
                  } else if (anno.kind === "textReplace") {
                    if (!dragStartTransform.current) return;
                    const origT = dragStartTransform.current;
                    const rawRect = {
                      x: origT[4] + dx,
                      y: origT[5] + dy,
                      w: (anno as TextReplaceAnno).width || 50,
                      h: fontHeight / zoom,
                    };
                    const snapped = onDragSnap ? onDragSnap(rawRect, false, anno.id) : rawRect;
                    const newTransform = [...origT];
                    newTransform[4] = snapped.x;
                    newTransform[5] = snapped.y;
                    onUpdate({ transform: newTransform } as any, false);
                  }
                }}
              />
              {anno.kind === "textbox" && (
                <ResizeHandle
                  onDragStart={pushHistorySnapshot}
                  onResize={(dxS, dyS) => {
                    const p0 = vp.convertToPdfPoint(0, 0);
                    const p1 = vp.convertToPdfPoint(dxS, dyS);
                    const dw = p1[0] - p0[0];
                    const dh = p1[1] - p0[1];
                    onUpdate({
                      w: Math.max(20, anno.w + dw),
                      h: Math.max(20, anno.h - dh),
                    } as any, false);
                  }}
                />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className={cn(
                  "absolute rounded-full bg-destructive p-0.5 text-destructive-foreground",
                  isSmall ? (isNarrow ? "-right-4 -top-5" : "-right-1 -top-5") : "-right-2 -top-2"
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </>
          );
        })()}
      </div>
    );
  }

  if (anno.kind === "comment") {
    const p = vp.convertToViewportPoint(anno.x, anno.y);
    return (
      <CommentPin
        anno={anno}
        vp={vp}
        left={p[0]}
        top={p[1]}
        selected={selected}
        onSelect={onSelect}
        onUpdate={onUpdate}
        onRemove={onRemove}
        t={t}
      />
    );
  }

  return null;
}

function DeleteBtn({
  rect,
  onRemove,
  inner,
}: {
  rect: { left: number; top: number; width: number; height: number };
  onRemove: () => void;
  inner?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="absolute z-10 rounded-full bg-destructive p-0.5 text-destructive-foreground"
      style={
        inner ? { right: -8, top: -8 } : { left: rect.left + rect.width - 8, top: rect.top - 8 }
      }
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function MoveHandle({
  onMove,
  onDragStart,
  onDragEnd,
  className,
}: {
  onMove: (dx: number, dy: number, dxTotal: number, dyTotal: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  className?: string;
}) {
  const last = useRef<[number, number] | null>(null);
  const start = useRef<[number, number] | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        last.current = [e.clientX, e.clientY];
        start.current = [e.clientX, e.clientY];
        onDragStart?.();
      }}
      onPointerMove={(e) => {
        if (!last.current || !start.current) return;
        const dx = e.clientX - last.current[0];
        const dy = e.clientY - last.current[1];
        const dxTotal = e.clientX - start.current[0];
        const dyTotal = e.clientY - start.current[1];
        last.current = [e.clientX, e.clientY];
        onMove(dx, dy, dxTotal, dyTotal);
      }}
      onPointerUp={() => {
        last.current = null;
        start.current = null;
        onDragEnd?.();
      }}
      className={cn(
        "absolute cursor-move rounded bg-primary p-0.5 text-primary-foreground",
        className || "-left-2 -top-2"
      )}
    >
      <GripVertical className="h-3 w-3" />
    </div>
  );
}

function ResizeHandle({
  onResize,
  onDragStart,
  onDragEnd,
}: {
  onResize: (dx: number, dy: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const last = useRef<[number, number] | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        last.current = [e.clientX, e.clientY];
        onDragStart?.();
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const dx = e.clientX - last.current[0];
        const dy = e.clientY - last.current[1];
        last.current = [e.clientX, e.clientY];
        onResize(dx, dy);
      }}
      onPointerUp={() => {
        last.current = null;
        onDragEnd?.();
      }}
      className="absolute -bottom-2 -right-2 cursor-nwse-resize rounded bg-primary p-0.5 text-primary-foreground"
    >
      <Move className="h-3 w-3" />
    </div>
  );
}

function CommentPin({
  anno,
  vp,
  left,
  top,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  t,
}: {
  anno: Extract<Annotation, { kind: "comment" }>;
  vp: Viewport;
  left: number;
  top: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
  onRemove: () => void;
  t: (k: any) => string;
}) {
  const [replyText, setReplyText] = useState("");
  const last = useRef<[number, number] | null>(null);
  const isDragging = useRef(false);

  return (
    <div className="absolute" style={{ left, top, pointerEvents: "auto" }}>
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.target as Element).setPointerCapture(e.pointerId);
          last.current = [e.clientX, e.clientY];
          isDragging.current = false;
        }}
        onPointerMove={(e) => {
          if (!last.current) return;
          const dx = e.clientX - last.current[0];
          const dy = e.clientY - last.current[1];
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isDragging.current = true;
          }
          if (isDragging.current) {
            last.current = [e.clientX, e.clientY];
            const p0 = vp.convertToPdfPoint(0, 0);
            const p1 = vp.convertToPdfPoint(dx, dy);
            onUpdate({ x: anno.x + (p1[0] - p0[0]), y: anno.y + (p1[1] - p0[1]) });
          }
        }}
        onPointerUp={(e) => {
          (e.target as Element).releasePointerCapture(e.pointerId);
          last.current = null;
          if (!isDragging.current) {
            onSelect();
          }
          isDragging.current = false;
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-none shadow-md transition-transform hover:scale-110 cursor-move",
          anno.resolved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <MessageSquare className="h-4 w-4" />
      </button>
      {selected && (
        <div
          className="absolute left-8 top-0 z-20 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            autoFocus
            value={anno.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            placeholder={t("writeComment")}
            className="w-full resize-none rounded border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            rows={2}
          />
          {anno.replies.map((r) => (
            <div key={r.id} className="mt-2 rounded bg-muted p-2 text-xs">
              {r.text}
            </div>
          ))}
          <div className="mt-2 flex gap-1">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t("addReply")}
              className="flex-1 rounded border bg-background px-2 py-1 text-xs outline-none"
            />
            <button
              onClick={() => {
                if (!replyText.trim()) return;
                onUpdate({
                  replies: [...anno.replies, { id: uid(), text: replyText, ts: Date.now() }],
                });
                setReplyText("");
              }}
              className="rounded bg-primary px-2 text-xs text-primary-foreground"
            >
              {t("reply")}
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <button
              onClick={() => onUpdate({ resolved: !anno.resolved })}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" />
              {anno.resolved ? t("reopen") : t("resolve")}
            </button>
            <button onClick={onRemove} className="text-xs text-destructive">
              {t("delete")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Crop tool overlay ----
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw" | "move";

function CropOverlay({ pageId, vp }: { pageId: number; vp: Viewport }) {
  const annotations = useEditor((s) => s.annotations);
  const selectedPages = useEditor((s) => s.selectedPages);
  const pageOrder = useEditor((s) => s.pageOrder);
  const currentPage = useEditor((s) => s.currentPage);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const pushHistorySnapshot = useEditor((s) => s.pushHistorySnapshot);

  // is this page in the active set? empty selectedPages => only currentPage
  const displayIdx = pageOrder.indexOf(pageId);
  const targets = selectedPages.length ? selectedPages : [currentPage];
  const inScope = targets.includes(displayIdx);

  // page size in PDF space via viewport
  const pageW = vp.width / (vp as any).scale || vp.convertToPdfPoint(vp.width, 0)[0];
  const pageH = vp.height / (vp as any).scale || Math.abs(vp.convertToPdfPoint(0, vp.height)[1]);

  const existing = annotations.find((a) => a.page === pageId && a.kind === "crop") as
    | Extract<Annotation, { kind: "crop" }>
    | undefined;
  const rect: Rect = existing?.rect ?? { x: 0, y: 0, w: pageW, h: pageH };
  const rotation = existing?.rotation ?? 0;

  const dragRef = useRef<{
    handle: Handle;
    startClient: [number, number];
    startRect: Rect;
  } | null>(null);

  const applyToAll = (nextRect: Rect, commit = false) => {
    for (const di of targets) {
      const pid = pageOrder[di];
      const ex = useEditor
        .getState()
        .annotations.find((a) => a.page === pid && a.kind === "crop") as
        | Extract<Annotation, { kind: "crop" }>
        | undefined;
      if (ex) {
        updateAnnotation(ex.id, { rect: nextRect } as any, commit);
      } else {
        addAnnotation({
          id: Math.random().toString(36).slice(2, 10),
          kind: "crop",
          page: pid,
          rect: nextRect,
          rotation: 0,
        } as any);
      }
    }
  };

  const onDown = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pushHistorySnapshot();
    dragRef.current = { handle: h, startClient: [e.clientX, e.clientY], startRect: rect };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dxScreen = e.clientX - d.startClient[0];
    const dyScreen = e.clientY - d.startClient[1];
    const p0 = vp.convertToPdfPoint(0, 0);
    const p1 = vp.convertToPdfPoint(dxScreen, dyScreen);
    const dxPdf = p1[0] - p0[0];
    const dyPdf = p1[1] - p0[1];
    let { x, y, w, h } = d.startRect;
    const h_ = d.handle;
    if (h_ === "move") {
      x += dxPdf;
      y += dyPdf;
    } else {
      // In PDF space y grows upward; screen dyPdf < 0 when moving down.
      // Handle names refer to on-screen edges.
      if (h_.includes("w")) {
        x += dxPdf;
        w -= dxPdf;
      }
      if (h_.includes("e")) {
        w += dxPdf;
      }
      if (h_.includes("n")) {
        // top edge (screen) → higher y in PDF space
        h += dyPdf;
      }
      if (h_.includes("s")) {
        // bottom edge (screen) → lower y in PDF space
        y += dyPdf;
        h -= dyPdf;
      }
    }
    // clamp
    if (w < 10) w = 10;
    if (h < 10) h = 10;
    x = Math.max(0, Math.min(pageW - w, x));
    y = Math.max(0, Math.min(pageH - h, y));
    w = Math.min(pageW - x, w);
    h = Math.min(pageH - y, h);
    applyToAll({ x, y, w, h }, false);
  };

  const onUp = () => {
    if (dragRef.current) {
      // final commit
      const last = useEditor
        .getState()
        .annotations.find((a) => a.page === pageId && a.kind === "crop") as
        | Extract<Annotation, { kind: "crop" }>
        | undefined;
      if (last) applyToAll(last.rect, false); // history already pushed on down
    }
    dragRef.current = null;
  };

  const s = screenRect(rect, vp);
  const dim = "rgba(0,0,0,0.55)";

  if (!inScope) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ pointerEvents: "auto" }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {/* 4 dim rectangles around the crop rect */}
      <div className="absolute" style={{ left: 0, top: 0, width: "100%", height: s.top, background: dim, pointerEvents: "none" }} />
      <div className="absolute" style={{ left: 0, top: s.top + s.height, width: "100%", bottom: 0, background: dim, pointerEvents: "none" }} />
      <div className="absolute" style={{ left: 0, top: s.top, width: s.left, height: s.height, background: dim, pointerEvents: "none" }} />
      <div className="absolute" style={{ left: s.left + s.width, top: s.top, right: 0, height: s.height, background: dim, pointerEvents: "none" }} />

      {/* Inner frame + rotation visual (border only rotates as a preview cue) */}
      <div
        className="absolute border-2 border-primary"
        style={{
          left: s.left,
          top: s.top,
          width: s.width,
          height: s.height,
          cursor: "move",
          transform: rotation ? `rotate(${-rotation}deg)` : undefined,
          transformOrigin: "center center",
        }}
        onPointerDown={onDown("move")}
      >
        {/* handles */}
        {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as Handle[]).map((h) => {
          const style: React.CSSProperties = {
            position: "absolute",
            width: 10,
            height: 10,
            background: "hsl(var(--primary))",
            border: "1px solid white",
            borderRadius: 2,
          };
          if (h.includes("n")) style.top = -6;
          if (h.includes("s")) style.bottom = -6;
          if (h.includes("w")) style.left = -6;
          if (h.includes("e")) style.right = -6;
          if (h === "n" || h === "s") {
            style.left = "50%";
            style.transform = "translateX(-50%)";
            style.cursor = "ns-resize";
          } else if (h === "e" || h === "w") {
            style.top = "50%";
            style.transform = "translateY(-50%)";
            style.cursor = "ew-resize";
          } else {
            style.cursor =
              h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize";
          }
          return (
            <div
              key={h}
              style={style}
              onPointerDown={onDown(h)}
              onPointerMove={onMove}
              onPointerUp={onUp}
            />
          );
        })}
      </div>
    </div>
  );
}

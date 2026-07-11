import { useCallback, useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { GripVertical, X, MessageSquare, Check, Move } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Annotation, Rect } from "@/lib/pdf/types";
import { resolvePDFCoreFontName, loadWebFont, cssFontStack } from "@/lib/pdf/fontDetect";
import {
  screenRect,
  pdfPoint,
  rectFromPdfPoints,
  type Viewport,
} from "@/lib/pdf/screen";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
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

export function PageView({ doc, pageId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [items, setItems] = useState<TextItem[]>([]);
  const [imageRects, setImageRects] = useState<Rect[]>([]);
  const fontRealNames = useRef<Record<string, string>>({});
  const replaceRectRef = useRef<Rect | null>(null);

  const zoom = useEditor((s) => s.zoom);
  const tool = useEditor((s) => s.tool);
  const color = useEditor((s) => s.color);
  const highlightColor = useEditor((s) => s.highlightColor);
  const fontSize = useEditor((s) => s.fontSize);
  const penSize = useEditor((s) => s.penSize);
  const annotations = useEditor((s) => s.annotations);
  const selectedId = useEditor((s) => s.selectedId);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const select = useEditor((s) => s.select);
  const { t } = useI18n();

  const pageAnnos = annotations.filter((a) => a.page === pageId);

  // --- render page + text content ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageId + 1);
      const vp = page.getViewport({ scale: zoom });
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (cancelled) return;
      setViewport(vp as unknown as Viewport);
      const content = await page.getTextContent();
      if (cancelled) return;
      const its: TextItem[] = [];
      for (const it of content.items) {
        if ("str" in it && it.str)
          its.push({
            str: it.str,
            transform: it.transform as number[],
            width: it.width as number,
            height: it.height as number,
            fontName: (it as any).fontName,
          });
      }
      setItems(its);
      // resolve real font names (subset PS names) for style detection
      const names: Record<string, string> = {};
      for (const fn of new Set(its.map((x) => x.fontName).filter(Boolean) as string[])) {
        try {
          const f = page.commonObjs.get(fn);
          if (f?.name) names[fn] = f.name as string;
        } catch {
          /* not available */
        }
      }
      fontRealNames.current = names;
      // detect images (only needed for the select tool, but cheap to keep ready)
      const imgs = await detectImages(page);
      if (!cancelled) setImageRects(imgs);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageId, zoom]);

  // --- position text-layer spans ---
  useEffect(() => {
    const layer = textLayerRef.current;
    if (!layer || !viewport) return;
    for (const span of Array.from(layer.children) as HTMLElement[]) {
      const idx = Number(span.dataset.i);
      const item = items[idx];
      if (!item) continue;
      const tx = pdfjsLib.Util.transform(
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
      addAnnotation({ id: uid(), kind: "comment", page: pageId, x: px, y: py, text: "", replies: [], resolved: false } as Annotation);
      return;
    }
    if (tool === "textbox") {
      const [px, py] = pdfPoint(sx, sy, vp);
      addAnnotation({ id: uid(), kind: "textbox", page: pageId, x: px, y: py, w: 180, h: fontSize * 2, text: "", fontSize, color } as Annotation);
      return;
    }
    startRef.current = [sx, sy];
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const vp = getVp();
    if (!vp) return;
    const [sx, sy] = localXY(e);
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
      addAnnotation({ id: uid(), kind: "pen", page: pageId, points: pts, color, size: penSize } as Annotation);
      penPtsRef.current = [];
      setPenScreen([]);
      return;
    }
    if (draft && (draft.w > 2 || draft.h > 2)) {
      if (tool === "redact") {
        addAnnotation({ id: uid(), kind: "redact", page: pageId, rect: draft } as Annotation);
      } else if (tool === "highlight") {
        addAnnotation({ id: uid(), kind: "highlight", page: pageId, rects: [draft], color: highlightColor } as Annotation);
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
        addAnnotation({ id: uid(), kind: "highlight", page: pageId, rects, color: highlightColor } as Annotation);
      }
      sel.removeAllRanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, highlightColor, pageId, viewport]);

  // --- click a span to replace its text (font-aware) ---
  const replaceSpan = (idx: number) => {
    const vp = getVp();
    const item = items[idx];
    if (!vp || !item) return;
    const tx = pdfjsLib.Util.transform(
      (viewport as unknown as { transform: number[] }).transform,
      item.transform,
    );
    const fontHeight = Math.hypot(tx[2], tx[3]);
    const left = tx[4];
    const top = tx[5] - fontHeight;
    const p1 = pdfPoint(left, top, vp);
    const p2 = pdfPoint(left + item.width * zoom, top + fontHeight, vp);
    const rect = rectFromPdfPoints(p1, p2);

    const realName = (item.fontName && fontRealNames.current[item.fontName]) || item.fontName || "";
    const resolved = resolvePDFCoreFontName(realName);
    if (resolved.family) void loadWebFont(resolved.family);

    addAnnotation({
      id: uid(),
      kind: "textReplace",
      page: pageId,
      rect,
      text: item.str,
      fontSize: Math.max(6, rect.h * 0.82),
      color: "#111111",
      fontFamily: resolved.family,
      bold: resolved.isBold,
      italic: resolved.isItalic,
    } as Annotation);
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
    addAnnotation({ id: uid(), kind: "textbox", page: pageId, x: px, y: py, w: 200, h: fontSize * 2, text: "", fontSize, color } as Annotation);
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
          addAnnotation({ id: uid(), kind: "redact", page: pageId, rect: rectFromPdfPoints(p1, p2) } as Annotation);
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
    const rect = img ?? { x: pdfPoint(pt[0], pt[1], vp)[0] - 40, y: pdfPoint(pt[0], pt[1], vp)[1] - 8, w: 80, h: 16 };
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
      addAnnotation({ id: uid(), kind: "image", page: pageId, rect, dataUrl: String(reader.result) } as Annotation);
    };
    reader.readAsDataURL(file);
  };

  const textInteractive = tool === "highlight" || tool === "edit-text" || tool === "redact";
  // Overlay handles pointer events for drawing tools and comment placement.
  // select tool also needs overlay to be interactive for existing annotation drag/resize handles.
  const overlayInteractive = tool === "pen" || tool === "textbox" || tool === "comment" || tool === "select";

  const cursor =
    tool === "pen"
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
              return (
                <div
                  key={`img-${i}`}
                  className="pointer-events-none absolute border border-dashed border-primary/40"
                  style={{ ...s }}
                />
              );
            })}

          {/* overlay (annotations + creation) */}
          <div
            className="absolute inset-0"
            style={{ pointerEvents: overlayInteractive ? "auto" : "none", cursor }}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
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
                  onUpdate={(patch) => updateAnnotation(a.id, patch)}
                  onRemove={() => removeAnnotation(a.id)}
                  t={t}
                />
              ))}

            {viewport && draft && (
              <div
                className={cn("absolute border-2", tool === "redact" ? "bg-black/80 border-destructive" : "border-primary")}
                style={{
                  ...screenRect(draft, viewport),
                  background: tool === "highlight" ? `color-mix(in srgb, ${highlightColor} 45%, transparent)` : undefined,
                }}
              />
            )}

            {penScreen.length > 1 && (
              <svg className="absolute inset-0 h-full w-full pointer-events-none">
                <path
                  d={strokeToPath(getStroke(penScreen, { size: penSize * zoom, thinning: 0.5, streamline: 0.5 }))}
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
            const el = document.elementFromPoint(base.left + pt[0], base.top + pt[1]) as HTMLElement | null;
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
  // lightweight, avoid extra imports at top
  import("sonner").then((m) => m.toast.success("✓")).catch(() => {});
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
}: {
  anno: Annotation;
  vp: Viewport;
  zoom: number;
  selected: boolean;
  tool: string;
  onSelect: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
  onRemove: () => void;
  t: (k: any) => string;
}) {
  const selectable = tool === "select";

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
        {selected && <DeleteBtn rect={{ left: 0, top: 0, width: s.width, height: s.height }} onRemove={onRemove} inner />}
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
              onMove={(dxS, dyS) => {
                const p0 = vp.convertToPdfPoint(0, 0);
                const p1 = vp.convertToPdfPoint(dxS, dyS);
                onUpdate({ rect: { ...anno.rect, x: anno.rect.x + (p1[0] - p0[0]), y: anno.rect.y + (p1[1] - p0[1]) } } as any);
              }}
            />
            <ResizeHandle
              onResize={(dxS, dyS) => {
                const p0 = vp.convertToPdfPoint(0, 0);
                const p1 = vp.convertToPdfPoint(dxS, dyS);
                const dw = p1[0] - p0[0];
                const dh = p1[1] - p0[1];
                onUpdate({ rect: { x: anno.rect.x, y: anno.rect.y - -dh < 0 ? anno.rect.y : anno.rect.y - -dh, w: Math.max(10, anno.rect.w + dw), h: Math.max(10, anno.rect.h - dh) } } as any);
              }}
            />
            <DeleteBtn rect={{ left: 0, top: 0, width: s.width, height: s.height }} onRemove={onRemove} inner />
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
    return (
      <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }}>
        <path
          d={strokeToPath(getStroke(pts, { size: anno.size * zoom, thinning: 0.5, streamline: 0.5 }))}
          fill={anno.color}
          onClick={selectable ? onSelect : undefined}
          style={{ pointerEvents: selectable ? "auto" : "none" }}
        />
        {selected && (
          <g onClick={onRemove} style={{ cursor: "pointer", pointerEvents: "auto" }}>
            <circle cx={pts[0][0]} cy={pts[0][1]} r={9} fill="hsl(0 72% 51%)" />
          </g>
        )}
      </svg>
    );
  }

  if (anno.kind === "textReplace" || anno.kind === "textbox") {
    const rect: Rect =
      anno.kind === "textReplace" ? anno.rect : { x: anno.x, y: anno.y - anno.h, w: anno.w, h: anno.h };
    const s = screenRect(rect, vp);
    const family = cssFontStack(anno.fontFamily || "");
    return (
      <div
        className={cn("absolute group", selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50")}
        style={{
          ...s,
          minHeight: 20,
          pointerEvents: selectable || selected ? "auto" : "none",
          // hide the original glyph underneath as soon as the replacement exists
          background: anno.kind === "textReplace" ? "white" : undefined,
        }}
        onClick={onSelect}
      >
        <textarea
          value={anno.text}
          onChange={(e) => {
            const el = e.target as HTMLTextAreaElement;
            // auto-grow the box to fit its content
            el.style.height = "auto";
            el.style.height = `${el.scrollHeight}px`;
            onUpdate({ text: el.value } as any);
          }}
          onFocus={onSelect}
          placeholder={anno.kind === "textbox" ? t("newTextbox") : ""}
          className="h-full w-full resize-none overflow-hidden bg-transparent p-0 leading-tight outline-none"
          style={{
            fontSize: anno.fontSize * zoom,
            color: anno.color,
            fontFamily: family,
            fontWeight: anno.bold ? 700 : 400,
            fontStyle: anno.italic ? "italic" : "normal",
          }}
        />
        {selected && (
          <>
            <MoveHandle
              onMove={(dxScreen, dyScreen) => {
                const p0 = vp.convertToPdfPoint(0, 0);
                const p1 = vp.convertToPdfPoint(dxScreen, dyScreen);
                const dx = p1[0] - p0[0];
                const dy = p1[1] - p0[1];
                if (anno.kind === "textbox") {
                  onUpdate({ x: anno.x + dx, y: anno.y + dy } as any);
                } else {
                  onUpdate({ rect: { ...anno.rect, x: anno.rect.x + dx, y: anno.rect.y + dy } } as any);
                }
              }}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  }

  if (anno.kind === "comment") {
    const p = vp.convertToViewportPoint(anno.x, anno.y);
    return <CommentPin anno={anno} left={p[0]} top={p[1]} selected={selected} onSelect={onSelect} onUpdate={onUpdate} onRemove={onRemove} t={t} />;
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
      style={inner ? { right: -8, top: -8 } : { left: rect.left + rect.width - 8, top: rect.top - 8 }}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function MoveHandle({ onMove }: { onMove: (dx: number, dy: number) => void }) {
  const last = useRef<[number, number] | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        last.current = [e.clientX, e.clientY];
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const dx = e.clientX - last.current[0];
        const dy = e.clientY - last.current[1];
        last.current = [e.clientX, e.clientY];
        onMove(dx, dy);
      }}
      onPointerUp={() => (last.current = null)}
      className="absolute -left-2 -top-2 cursor-move rounded bg-primary p-0.5 text-primary-foreground"
    >
      <GripVertical className="h-3 w-3" />
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize: (dx: number, dy: number) => void }) {
  const last = useRef<[number, number] | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as Element).setPointerCapture(e.pointerId);
        last.current = [e.clientX, e.clientY];
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const dx = e.clientX - last.current[0];
        const dy = e.clientY - last.current[1];
        last.current = [e.clientX, e.clientY];
        onResize(dx, dy);
      }}
      onPointerUp={() => (last.current = null)}
      className="absolute -bottom-2 -right-2 cursor-nwse-resize rounded bg-primary p-0.5 text-primary-foreground"
    >
      <Move className="h-3 w-3" />
    </div>
  );
}

function CommentPin({
  anno,
  left,
  top,
  selected,
  onSelect,
  onUpdate,
  onRemove,
  t,
}: {
  anno: Extract<Annotation, { kind: "comment" }>;
  left: number;
  top: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<Annotation>) => void;
  onRemove: () => void;
  t: (k: any) => string;
}) {
  const [replyText, setReplyText] = useState("");
  return (
    <div className="absolute" style={{ left, top, pointerEvents: "auto" }}>
      <button
        onPointerDown={(e) => {
          // Stop the overlay's onPointerDown from firing – otherwise a new
          // comment pin is created instead of opening this existing one.
          e.stopPropagation();
          onSelect();
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-none shadow-md transition-transform hover:scale-110 active:scale-95",
          anno.resolved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <MessageSquare className="h-4 w-4" />
      </button>
      {selected && (
        <div className="absolute left-8 top-0 z-20 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                onUpdate({ replies: [...anno.replies, { id: uid(), text: replyText, ts: Date.now() }] });
                setReplyText("");
              }}
              className="rounded bg-primary px-2 text-xs text-primary-foreground"
            >
              {t("reply")}
            </button>
          </div>
          <div className="mt-2 flex justify-between">
            <button onClick={() => onUpdate({ resolved: !anno.resolved })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
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

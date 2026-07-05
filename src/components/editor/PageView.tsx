import { useCallback, useEffect, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { GripVertical, X, MessageSquare, Check } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { pdfjsLib } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Annotation, Rect } from "@/lib/pdf/types";
import {
  screenRect,
  pdfPoint,
  rectFromPdfPoints,
  type Viewport,
} from "@/lib/pdf/screen";
import { cn } from "@/lib/utils";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
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

export function PageView({ doc, pageId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [items, setItems] = useState<TextItem[]>([]);

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
          });
      }
      setItems(its);
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
      const actual = span.getBoundingClientRect().width / (target ? 1 : 1);
      const scaleX = actual > 0 ? target / (span.offsetWidth || target) : 1;
      span.style.transform = `rotate(${angle}rad) scaleX(${scaleX})`;
    }
  }, [items, viewport, zoom]);

  const getVp = () => viewport;

  // --- drag-to-create for rect tools + pen + comment ---
  const [draft, setDraft] = useState<Rect | null>(null);
  const penPtsRef = useRef<[number, number][]>([]);
  const [penScreen, setPenScreen] = useState<[number, number][]>([]);
  const startRef = useRef<[number, number] | null>(null);

  const localXY = (e: React.PointerEvent) => {
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
      } as Annotation);
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

  // --- selection based highlight (text layer) ---
  const onTextMouseUp = useCallback(() => {
    if (tool !== "highlight") return;
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
      addAnnotation({
        id: uid(),
        kind: "highlight",
        page: pageId,
        rects,
        color: highlightColor,
      } as Annotation);
      sel.removeAllRanges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, highlightColor, pageId, viewport]);

  // --- click a span to replace its text ---
  const onSpanClick = (idx: number) => {
    if (tool !== "edit-text") return;
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
    addAnnotation({
      id: uid(),
      kind: "textReplace",
      page: pageId,
      rect,
      text: item.str,
      fontSize: Math.max(6, Math.round(rect.h * 0.85)),
      color: "#111111",
    } as Annotation);
  };

  const textInteractive = tool === "highlight" || tool === "edit-text";
  const overlayInteractive =
    tool === "redact" || tool === "pen" || tool === "textbox" || tool === "comment";

  const cursor =
    tool === "redact"
      ? "crosshair"
      : tool === "pen"
        ? "crosshair"
        : tool === "textbox" || tool === "comment"
          ? "copy"
          : "default";

  return (
    <div
      ref={wrapRef}
      className="relative shadow-lg ring-1 ring-black/5"
      style={{ width: viewport?.width, height: viewport?.height, background: "white" }}
    >
      <canvas ref={canvasRef} className="block" />

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
            style={{ cursor: tool === "edit-text" ? "text" : undefined }}
          >
            {it.str}
          </span>
        ))}
      </div>

      {/* overlay (existing annotations + creation) */}
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

        {/* live draft rect */}
        {viewport && draft && (
          <div
            className={cn(
              "absolute border-2",
              tool === "redact"
                ? "bg-black/80 border-destructive"
                : "border-primary",
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

        {/* live pen preview */}
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
  );
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

  if (anno.kind === "pen") {
    const pts = anno.points.map((p) => {
      const sp = vp.convertToViewportPoint(p[0], p[1]);
      return [sp[0], sp[1]] as [number, number];
    });
    return (
      <svg
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: "none" }}
      >
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
      anno.kind === "textReplace"
        ? anno.rect
        : { x: anno.x, y: anno.y - anno.h, w: anno.w, h: anno.h };
    const s = screenRect(rect, vp);
    return (
      <div
        className={cn(
          "absolute group",
          selected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/50",
        )}
        style={{ ...s, minHeight: 20, pointerEvents: selectable || selected ? "auto" : "none" }}
        onClick={onSelect}
      >
        <textarea
          value={anno.text}
          onChange={(e) => onUpdate({ text: e.target.value } as any)}
          onFocus={onSelect}
          placeholder={t("newTextbox")}
          className="h-full w-full resize-none bg-transparent p-0 leading-tight outline-none"
          style={{
            fontSize: anno.fontSize * zoom,
            color: anno.color,
            fontFamily: "Helvetica, Arial, sans-serif",
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
                  onUpdate({
                    rect: { ...anno.rect, x: anno.rect.x + dx, y: anno.rect.y + dy },
                  } as any);
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
      style={
        inner
          ? { right: -8, top: -8 }
          : { left: rect.left + rect.width - 8, top: rect.top - 8 }
      }
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
        onClick={onSelect}
        className={cn(
          "flex h-7 w-7 -translate-y-full items-center justify-center rounded-full rounded-bl-none shadow-md",
          anno.resolved ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground",
        )}
      >
        <MessageSquare className="h-4 w-4" />
      </button>
      {selected && (
        <div
          className="absolute left-8 top-0 z-20 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl"
          onClick={(e) => e.stopPropagation()}
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

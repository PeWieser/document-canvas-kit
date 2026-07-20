import { useEffect, useMemo, useRef, useState } from "react";
import { X, RotateCw, GripVertical } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Annotation, CropAnno, Rect } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);

type Selection = "current" | "all" | "custom";

/** Parse ranges like "1-3, 5, 7-9" (1-based) → sorted unique display indices (0-based). */
export function parsePageRange(input: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of input.split(",")) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      const a = Math.max(1, parseInt(m[1], 10));
      const b = Math.min(total, parseInt(m[2], 10));
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        if (i >= 1 && i <= total) out.add(i - 1);
      }
    } else {
      const n = parseInt(s, 10);
      if (!isNaN(n) && n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

interface Props {
  doc: PdfDocumentProxy;
}

/** Floating panel that drives the crop tool. */
export function CropToolPanel({ doc }: Props) {
  const { t } = useI18n();
  const setTool = useEditor((s) => s.setTool);
  const pageOrder = useEditor((s) => s.pageOrder);
  const currentPage = useEditor((s) => s.currentPage);
  const annotations = useEditor((s) => s.annotations);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const storeSelectedPages = useEditor((s) => s.selectedPages);
  const setSelectedPages = useEditor((s) => s.setSelectedPages);

  const total = pageOrder.length;

  const [selection, setSelection] = useState<Selection>(
    storeSelectedPages.length > 1 ? "custom" : "current",
  );
  const [customText, setCustomText] = useState<string>(
    storeSelectedPages.length
      ? storeSelectedPages.map((i) => i + 1).join(", ")
      : "",
  );

  // Panel position (draggable). Fixed to viewport; scrolls with page? Plan
  // says "relative to whole site" – using fixed keeps it always visible which
  // is what a floating tool needs.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);

  useEffect(() => {
    if (pos) return;
    setPos({ x: Math.max(20, window.innerWidth - 360), y: window.innerHeight - 420 });
  }, [pos]);

  // Resolve targets (display indices)
  const targets = useMemo(() => {
    if (selection === "current") return [currentPage];
    if (selection === "all") return Array.from({ length: total }, (_, i) => i);
    return parsePageRange(customText, total);
  }, [selection, currentPage, total, customText]);

  // Keep store selection mirrored so PageView knows which pages get the overlay.
  useEffect(() => {
    setSelectedPages(targets);
  }, [targets, setSelectedPages]);

  // Load page sizes for targets to derive default crop rect
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const primary = targets[0] ?? currentPage;
  const primaryPid = pageOrder[primary];
  useEffect(() => {
    let cancelled = false;
    if (primaryPid == null) return;
    (async () => {
      const p = await doc.getPage(primaryPid + 1);
      const vp = p.getViewport({ scale: 1 });
      if (!cancelled) setPageSize({ w: vp.width, h: vp.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, primaryPid]);

  const primaryCrop = annotations.find(
    (a) => a.page === primaryPid && a.kind === "crop",
  ) as CropAnno | undefined;

  const rect: Rect = primaryCrop?.rect ??
    (pageSize ? { x: 0, y: 0, w: pageSize.w, h: pageSize.h } : { x: 0, y: 0, w: 0, h: 0 });
  const rotation = primaryCrop?.rotation ?? 0;

  const writeToTargets = (patch: { rect?: Rect; rotation?: number }, commitToHistory = true) => {
    for (const di of targets) {
      const pid = pageOrder[di];
      const existing = annotations.find((a) => a.page === pid && a.kind === "crop") as
        | CropAnno
        | undefined;
      if (existing) {
        updateAnnotation(
          existing.id,
          {
            rect: patch.rect ?? existing.rect,
            rotation: patch.rotation ?? existing.rotation ?? 0,
          } as Partial<Annotation>,
          commitToHistory,
        );
      } else {
        addAnnotation({
          id: uid(),
          kind: "crop",
          page: pid,
          rect: patch.rect ?? rect,
          rotation: patch.rotation ?? 0,
        } as Annotation);
      }
    }
  };

  const centerScale = (nextW: number, nextH: number) => {
    if (!pageSize) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const w = Math.max(10, Math.min(pageSize.w, nextW));
    const h = Math.max(10, Math.min(pageSize.h, nextH));
    let x = cx - w / 2;
    let y = cy - h / 2;
    x = Math.max(0, Math.min(pageSize.w - w, x));
    y = Math.max(0, Math.min(pageSize.h - h, y));
    writeToTargets({ rect: { x, y, w, h } });
  };

  const setXY = (nx: number, ny: number) => {
    if (!pageSize) return;
    const x = Math.max(0, Math.min(pageSize.w - rect.w, nx));
    const y = Math.max(0, Math.min(pageSize.h - rect.h, ny));
    writeToTargets({ rect: { ...rect, x, y } });
  };

  const resetFrame = () => {
    if (!pageSize) return;
    writeToTargets({ rect: { x: 0, y: 0, w: pageSize.w, h: pageSize.h }, rotation: 0 });
  };

  const removeCrops = () => {
    for (const di of targets) {
      const pid = pageOrder[di];
      const existing = annotations.find((a) => a.page === pid && a.kind === "crop");
      if (existing) removeAnnotation(existing.id);
    }
  };

  const close = () => {
    setTool("select");
    setSelectedPages([]);
  };

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (!pos) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { ox: pos.x, oy: pos.y, sx: e.clientX, sy: e.clientY };
  };
  const onHeaderPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 340, d.ox + (e.clientX - d.sx))),
      y: Math.max(0, Math.min(window.innerHeight - 60, d.oy + (e.clientY - d.sy))),
    });
  };
  const onHeaderPointerUp = () => {
    dragRef.current = null;
  };

  if (!pos) return null;

  return (
    <div
      className="fixed z-40 w-[320px] rounded-lg border bg-background shadow-2xl select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-move items-center gap-1.5 border-b px-3 py-2"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{t("cropTool")}</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {targets.length} {targets.length === 1 ? t("page") : t("pages")}
        </span>
        <button
          onClick={close}
          className="ml-1 rounded p-0.5 hover:bg-muted"
          title={t("close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3 text-xs">
        {/* Page selection */}
        <div>
          <div className="mb-1 font-medium text-muted-foreground">{t("pageSelection")}</div>
          <div className="flex gap-1">
            {(["current", "all", "custom"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSelection(s)}
                className={cn(
                  "flex-1 rounded border px-2 py-1 text-[11px]",
                  selection === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {s === "current" ? t("pageSelCurrent") : s === "all" ? t("pageSelAll") : t("pageSelCustom")}
              </button>
            ))}
          </div>
          {selection === "custom" && (
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={t("pageRangeHint")}
              className="mt-1.5 w-full rounded border bg-background px-2 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary"
            />
          )}
        </div>

        {/* Dimensions */}
        <div className="grid grid-cols-2 gap-2">
          <NumField label={t("cropWidth")} value={rect.w} onChange={(v) => centerScale(v, rect.h)} />
          <NumField label={t("cropHeight")} value={rect.h} onChange={(v) => centerScale(rect.w, v)} />
          <NumField label={t("cropX")} value={rect.x} onChange={(v) => setXY(v, rect.y)} />
          <NumField label={t("cropY")} value={rect.y} onChange={(v) => setXY(rect.x, v)} />
        </div>

        {/* Rotation */}
        <div>
          <div className="mb-1 flex items-center justify-between font-medium text-muted-foreground">
            <span className="flex items-center gap-1">
              <RotateCw className="h-3 w-3" />
              {t("cropRotation")}
            </span>
            <input
              type="number"
              step={0.1}
              value={Number(rotation.toFixed(1))}
              onChange={(e) => {
                const v = Math.max(-45, Math.min(45, parseFloat(e.target.value) || 0));
                writeToTargets({ rotation: v });
              }}
              className="w-14 rounded border bg-background px-1.5 py-0.5 text-right font-mono text-[11px] outline-none"
            />
            <span className="font-mono text-[10px] text-muted-foreground">°</span>
          </div>
          <WheelSlider
            value={rotation}
            onChange={(v) => writeToTargets({ rotation: v }, false)}
            onCommit={(v) => writeToTargets({ rotation: v })}
          />
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            onClick={() => writeToTargets({ rect, rotation })}
            className="flex-1 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("cropApply")}
          </button>
          <button
            onClick={resetFrame}
            className="rounded-md border px-2.5 py-1.5 text-[11px] hover:bg-muted"
          >
            {t("cropReset")}
          </button>
          <button
            onClick={removeCrops}
            className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-[11px] text-destructive hover:bg-destructive/10"
          >
            {t("removeCrop")}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [local, setLocal] = useState<string>(value.toFixed(1));
  useEffect(() => {
    setLocal(value.toFixed(1));
  }, [value]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="font-medium text-muted-foreground text-[10px] uppercase tracking-wider">
        {label}
      </span>
      <input
        type="number"
        step={1}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const v = parseFloat(local);
          if (!isNaN(v)) onChange(v);
          else setLocal(value.toFixed(1));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="rounded border bg-background px-1.5 py-1 font-mono text-[11px] outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

/** Fine wheel-like rotation slider with tick marks and 0° snap. */
function WheelSlider({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const min = -45;
  const max = 45;
  const range = max - min;

  const pct = ((value - min) / range) * 100;

  const setFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = (clientX - r.left) / r.width;
    let v = min + Math.max(0, Math.min(1, p)) * range;
    v = Math.round(v * 10) / 10;
    if (Math.abs(v) < 0.6) v = 0; // snap to zero
    onChange(v);
  };

  return (
    <div
      ref={barRef}
      className="relative h-8 cursor-ew-resize overflow-hidden rounded border bg-muted/40"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        draggingRef.current = true;
        setFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        setFromClientX(e.clientX);
      }}
      onPointerUp={() => {
        if (draggingRef.current) onCommit(value);
        draggingRef.current = false;
      }}
    >
      {/* Ticks */}
      <div className="absolute inset-0 flex items-end justify-between px-[2px]">
        {Array.from({ length: 91 }).map((_, i) => {
          const isMajor = i % 5 === 0;
          const isZero = i === 45;
          return (
            <div
              key={i}
              className={cn(
                "w-px bg-foreground/30",
                isMajor ? "h-3" : "h-1.5",
                isZero && "bg-primary",
              )}
            />
          );
        })}
      </div>
      {/* Center indicator */}
      <div
        className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-primary"
        style={{ left: `${pct}%` }}
      />
      <div className="absolute bottom-0 left-1 font-mono text-[9px] text-muted-foreground">
        -45°
      </div>
      <div className="absolute bottom-0 right-1 font-mono text-[9px] text-muted-foreground">
        +45°
      </div>
    </div>
  );
}

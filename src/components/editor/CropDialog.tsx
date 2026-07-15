import { useEffect, useMemo, useRef, useState } from "react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Annotation } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";

const uid = () => Math.random().toString(36).slice(2, 10);

interface Props {
  doc: PdfDocumentProxy;
  pages: number[]; // display indices to crop
  onClose: () => void;
}

/** Interactive crop dialog. Rectangle stored in PDF-space of the first page. */
export function CropDialog({ doc, pages, onClose }: Props) {
  const { t } = useI18n();
  const pageOrder = useEditor((s) => s.pageOrder);
  const annotations = useEditor((s) => s.annotations);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);

  const firstDisplay = pages[0];
  const pageId = pageOrder[firstDisplay];
  const [pageDims, setPageDims] = useState<{ w: number; h: number } | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  // Current crop in PDF space (points). Default = full page.
  const existing = useMemo(
    () => annotations.find((a) => a.page === pageId && a.kind === "crop") as Extract<Annotation, { kind: "crop" }> | undefined,
    [annotations, pageId],
  );
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ ox: number; oy: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageId + 1);
      const vp = page.getViewport({ scale: 1 });
      if (cancelled) return;
      setPageDims({ w: vp.width, h: vp.height });
      setRect(existing?.rect ?? { x: 0, y: 0, w: vp.width, h: vp.height });

      // Render preview at ~600px width
      const scale = Math.min(1.5, 600 / vp.width);
      const vp2 = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = Math.ceil(vp2.width);
      c.height = Math.ceil(vp2.height);
      const ctx = c.getContext("2d")!;
      await page.render({ canvasContext: ctx as any, viewport: vp2, canvas: c } as any).promise;
      if (!cancelled) setImgUrl(c.toDataURL());
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, pageId, existing]);

  const previewW = 600;
  const scale = pageDims ? previewW / pageDims.w : 1;
  const previewH = pageDims ? pageDims.h * scale : 400;

  // rect on preview (screen space, top-left origin)
  const previewRect = rect && pageDims
    ? {
        left: rect.x * scale,
        top: (pageDims.h - (rect.y + rect.h)) * scale,
        width: rect.w * scale,
        height: rect.h * scale,
      }
    : null;

  const onMouseDown = (e: React.MouseEvent) => {
    if (!canvasRef.current || !pageDims) return;
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // start a new rect
    const pdfX = px / scale;
    const pdfY = pageDims.h - py / scale;
    setRect({ x: pdfX, y: pdfY, w: 0, h: 0 });
    setDrag({ ox: pdfX, oy: pdfY, startX: e.clientX, startY: e.clientY });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag || !pageDims || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const curX = Math.max(0, Math.min(pageDims.w, px / scale));
    const curY = Math.max(0, Math.min(pageDims.h, pageDims.h - py / scale));
    const x = Math.min(drag.ox, curX);
    const y = Math.min(drag.oy, curY);
    const w = Math.abs(curX - drag.ox);
    const h = Math.abs(curY - drag.oy);
    setRect({ x, y, w, h });
  };
  const onMouseUp = () => setDrag(null);

  const apply = (allSelected: boolean) => {
    if (!rect || rect.w < 5 || rect.h < 5) return;
    const targets = allSelected ? pages : [firstDisplay];
    for (const di of targets) {
      const pid = pageOrder[di];
      const prev = annotations.find((a) => a.page === pid && a.kind === "crop");
      if (prev) removeAnnotation(prev.id);
      addAnnotation({
        id: uid(),
        kind: "crop",
        page: pid,
        rect: { ...rect },
      } as Annotation);
    }
    onClose();
  };

  const removeCrop = () => {
    if (existing) removeAnnotation(existing.id);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-[720px] flex-col rounded-lg border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t("crop")}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {pages.length > 1 ? `${pages.length} ${t("page")}s` : `${t("page")} ${firstDisplay + 1}`}
            </span>
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-xs hover:bg-muted">
            {t("cancel")}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div
            ref={canvasRef}
            className="relative mx-auto select-none rounded border bg-white shadow-sm"
            style={{ width: previewW, height: previewH }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            {imgUrl && (
              <img
                src={imgUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
              />
            )}
            {/* dim outside */}
            {previewRect && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-black/40" style={{
                  clipPath: `polygon(
                    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                    ${previewRect.left}px ${previewRect.top}px,
                    ${previewRect.left}px ${previewRect.top + previewRect.height}px,
                    ${previewRect.left + previewRect.width}px ${previewRect.top + previewRect.height}px,
                    ${previewRect.left + previewRect.width}px ${previewRect.top}px,
                    ${previewRect.left}px ${previewRect.top}px
                  )`,
                }} />
                <div
                  className="pointer-events-none absolute border-2 border-primary"
                  style={{
                    left: previewRect.left,
                    top: previewRect.top,
                    width: previewRect.width,
                    height: previewRect.height,
                  }}
                />
              </>
            )}
          </div>
          {rect && (
            <div className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
              x={rect.x.toFixed(1)} y={rect.y.toFixed(1)} w={rect.w.toFixed(1)} h={rect.h.toFixed(1)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          {existing ? (
            <button
              onClick={removeCrop}
              className="rounded-md border border-destructive/40 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              {t("removeCrop")}
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            {pages.length > 1 ? (
              <>
                <button
                  onClick={() => apply(false)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-xs hover:bg-muted",
                  )}
                >
                  {t("cropApplyOne")}
                </button>
                <button
                  onClick={() => apply(true)}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("cropApplyAll")} ({pages.length})
                </button>
              </>
            ) : (
              <button
                onClick={() => apply(false)}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t("apply")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

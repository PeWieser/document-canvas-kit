import { useEffect, useRef, useState } from "react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { memoryManager } from "@/lib/pdf/memoryManager";

export function PageThumb({
  doc,
  pageId,
  width = 130,
}: {
  doc: PdfDocumentProxy;
  pageId: number;
  width?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(1.414); // h/w placeholder until measured

  // Only render the thumbnail once it scrolls into view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let idleId: any = null;

    const renderThumb = async () => {
      const cacheKey = `thumb_${pageId}_${width}`;
      const cached = memoryManager.getThumbnail(cacheKey);

      if (cached && canvasRef.current && cached instanceof HTMLCanvasElement) {
        canvasRef.current.width = cached.width;
        canvasRef.current.height = cached.height;
        const ctx = canvasRef.current.getContext("2d");
        ctx?.drawImage(cached, 0, 0);
        return;
      }

      const page = await doc.getPage(pageId + 1);
      const base = page.getViewport({ scale: 1 });
      if (!cancelled) setRatio(base.height / base.width);
      const scale = width / base.width;
      const vp = page.getViewport({ scale });
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled && canvas.width > 0 && canvas.height > 0) {
          try {
            const clone = document.createElement("canvas");
            clone.width = canvas.width;
            clone.height = canvas.height;
            const cloneCtx = clone.getContext("2d");
            cloneCtx?.drawImage(canvas, 0, 0);
            memoryManager.setThumbnail(cacheKey, clone);
          } catch {
            // ignore clone errors
          }
        }
      }
    };

    // Defer thumbnail rendering off main looper using requestIdleCallback
    const scheduleRender = () => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleId = (window as any).requestIdleCallback(
          () => {
            if (!cancelled) void renderThumb();
          },
          { timeout: 1000 }
        );
      } else {
        idleId = setTimeout(() => {
          if (!cancelled) void renderThumb();
        }, 1);
      }
    };

    scheduleRender();

    return () => {
      cancelled = true;
      if (idleId !== null) {
        if (typeof window !== "undefined" && "cancelIdleCallback" in window) {
          (window as any).cancelIdleCallback(idleId);
        } else {
          clearTimeout(idleId);
        }
      }
    };
  }, [doc, pageId, width, visible]);

  return (
    <div ref={wrapRef} className="w-full">
      {visible ? (
        <canvas ref={canvasRef} className="block h-auto w-full rounded-sm bg-white" />
      ) : (
        <div className="w-full rounded-sm bg-white" style={{ paddingBottom: `${ratio * 100}%` }} />
      )}
    </div>
  );
}

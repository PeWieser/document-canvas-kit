import { useEffect, useRef, useState } from "react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";

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
    (async () => {
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
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    })();
    return () => {
      cancelled = true;
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

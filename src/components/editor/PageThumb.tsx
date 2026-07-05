import { useEffect, useRef } from "react";
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageId + 1);
      const base = page.getViewport({ scale: 1 });
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
  }, [doc, pageId, width]);

  return <canvas ref={canvasRef} className="block h-auto w-full rounded-sm bg-white" />;
}

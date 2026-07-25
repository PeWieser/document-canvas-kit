import { useEffect, useState } from "react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { lowResCache, renderLowResThumbnail } from "@/lib/pdf/lowResCache";

interface LowResPagePreviewProps {
  doc: PdfDocumentProxy;
  pageId: number;
  width: number;
  height: number;
  scale?: number;
}

export function LowResPagePreview({
  doc,
  pageId,
  width,
  height,
  scale = 0.35,
}: LowResPagePreviewProps) {
  const cacheKey = lowResCache.getCacheKey(doc, pageId, scale);
  const [imgUrl, setImgUrl] = useState<string | undefined>(() => lowResCache.get(cacheKey));

  useEffect(() => {
    let cancelled = false;

    const cached = lowResCache.get(cacheKey);
    if (cached) {
      setImgUrl(cached);
      return;
    }

    renderLowResThumbnail(doc, pageId, scale)
      .then((url) => {
        if (!cancelled) setImgUrl(url);
      })
      .catch((err) => {
        console.error("Failed to render low-res thumbnail for page", pageId, err);
      });

    return () => {
      cancelled = true;
    };
  }, [doc, pageId, scale, cacheKey]);

  return (
    <div
      className="relative shadow-lg ring-1 ring-black/5 bg-white flex items-center justify-center overflow-hidden"
      style={{ width, height }}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={`Page ${pageId + 1} preview`}
          className="w-full h-full object-contain pointer-events-none select-none"
        />
      ) : (
        <div className="w-full h-full bg-slate-100/50 flex flex-col items-center justify-center text-slate-400 text-xs font-medium gap-1">
          <div className="w-5 h-5 rounded-full border-2 border-slate-300 border-t-slate-500 animate-spin" />
          <span>Page {pageId + 1}</span>
        </div>
      )}
    </div>
  );
}

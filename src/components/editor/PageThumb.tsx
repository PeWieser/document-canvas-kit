import { useEffect, useRef, useState } from "react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { lowResCache, renderLowResThumbnail } from "@/lib/pdf/lowResCache";

export function PageThumb({
  doc,
  pageId,
  width = 130,
  pagesPerRow,
}: {
  doc: PdfDocumentProxy;
  pageId: number;
  width?: number;
  pagesPerRow?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(1.414);

  // Matrix Thumbnail Resolution Scaling
  let targetWidth = width;
  if (pagesPerRow !== undefined) {
    if (pagesPerRow >= 5) {
      targetWidth = 160;
    } else if (pagesPerRow >= 3) {
      targetWidth = 280;
    } else {
      targetWidth = 480;
    }
  }

  const scale = Math.round((targetWidth / 600) * 100) / 100;
  const cacheKey = doc ? lowResCache.getCacheKey(doc, pageId, scale) : "";
  const [imgUrl, setImgUrl] = useState<string | undefined>(() =>
    doc ? lowResCache.get(cacheKey) : undefined
  );

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
    if (!visible || !doc) return;

    const cached = lowResCache.get(cacheKey);
    if (cached) {
      setImgUrl(cached);
      return;
    }

    let cancelled = false;

    renderLowResThumbnail(doc, pageId, scale)
      .then((url) => {
        if (!cancelled) {
          setImgUrl(url);
        }
      })
      .catch(() => {
        // ignore thumbnail render errors
      });

    return () => {
      cancelled = true;
    };
  }, [doc, pageId, scale, cacheKey, visible]);

  return (
    <div ref={wrapRef} className="w-full">
      {visible && imgUrl ? (
        <img
          src={imgUrl}
          alt={`Seite ${pageId + 1}`}
          className="block h-auto w-full rounded-sm bg-white"
        />
      ) : (
        <div
          className="w-full rounded-sm bg-white"
          style={{ paddingBottom: `${ratio * 100}%` }}
        />
      )}
    </div>
  );
}

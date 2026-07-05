import { useEffect, useState } from "react";
import { loadPdfDocument, type PdfDocumentProxy } from "@/lib/pdf/pdfjs";

export function useLoadedPdf(bytes: Uint8Array | null) {
  const [doc, setDoc] = useState<PdfDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let current: PdfDocumentProxy | null = null;
    setDoc(null);
    setError(null);
    if (!bytes) return;
    (async () => {
      try {
        const d = await loadPdfDocument(bytes.buffer.slice(0) as ArrayBuffer);
        if (cancelled) {
          (d as unknown as { destroy: () => void }).destroy();
          return;
        }
        current = d;
        setDoc(d);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
      (current as unknown as { destroy?: () => void } | null)?.destroy?.();
    };
  }, [bytes]);

  return { doc, error };
}

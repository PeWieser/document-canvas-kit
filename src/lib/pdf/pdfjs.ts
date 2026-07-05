import * as pdfjsLib from "pdfjs-dist";
// Vite resolves this to a hashed URL for the worker bundle.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
export type PdfDocumentProxy = pdfjsLib.PDFDocumentProxy;
export type PdfPageProxy = pdfjsLib.PDFPageProxy;

export interface LoadedTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function loadPdfDocument(data: ArrayBuffer) {
  // Clone the buffer because pdf.js transfers/detaches the ArrayBuffer.
  const copy = data.slice(0);
  const doc = await pdfjsLib.getDocument({ data: copy }).promise;
  return doc;
}

export async function getPageTextItems(page: PdfPageProxy): Promise<LoadedTextItem[]> {
  const content = await page.getTextContent();
  const items: LoadedTextItem[] = [];
  for (const it of content.items) {
    // Only text items have `str`/`transform`.
    if ("str" in it) {
      items.push({
        str: it.str,
        transform: it.transform as number[],
        width: it.width as number,
        height: it.height as number,
      });
    }
  }
  return items;
}

import type { PdfDocumentProxy } from "./pdfjs";

export class LowResCache {
  private cache = new Map<string, string>();
  private pendingPromises = new Map<string, Promise<string>>();
  private maxSize: number = 50;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  public getCacheKey(doc: PdfDocumentProxy, pageIndex: number, scale: number): string {
    const docId =
      (doc as any)?.fingerprints?.[0] ||
      (doc as any)?.fingerprint ||
      (doc as any)?._pdfInfo?.fingerprint ||
      "doc";
    return `${docId}_page_${pageIndex}_scale_${scale}`;
  }

  public get(key: string): string | undefined {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key)!;
    // LRU refresh: re-insert key to mark as most recently used
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  public set(key: string, value: string): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public clear(): void {
    this.cache.clear();
    this.pendingPromises.clear();
  }

  public get size(): number {
    return this.cache.size;
  }

  public setMaxSize(maxSize: number): void {
    this.maxSize = maxSize;
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
  }

  public async renderLowResThumbnail(
    doc: PdfDocumentProxy,
    pageIndex: number,
    scale: number = 0.35
  ): Promise<string> {
    const key = this.getCacheKey(doc, pageIndex, scale);

    const cached = this.get(key);
    if (cached) {
      return cached;
    }

    if (this.pendingPromises.has(key)) {
      return this.pendingPromises.get(key)!;
    }

    const renderPromise = new Promise<string>((resolve, reject) => {
      const scheduleTask = () => {
        const executeRender = async () => {
          try {
            const existing = this.get(key);
            if (existing) {
              resolve(existing);
              return;
            }

            const page = await doc.getPage(pageIndex + 1);
            const viewport = page.getViewport({ scale });

            let canvas: HTMLCanvasElement;
            if (typeof document !== "undefined" && typeof document.createElement === "function") {
              canvas = document.createElement("canvas");
            } else {
              throw new Error("Canvas element unavailable");
            }

            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));

            const ctx = canvas.getContext("2d");
            if (!ctx) {
              throw new Error("Could not get 2d context");
            }

            await page.render({
              canvasContext: ctx,
              viewport: viewport,
            }).promise;

            const dataUrl = canvas.toDataURL("image/png");
            this.set(key, dataUrl);

            // Clean up canvas dimensions
            canvas.width = 0;
            canvas.height = 0;

            resolve(dataUrl);
          } catch (err) {
            reject(err);
          } finally {
            this.pendingPromises.delete(key);
          }
        };

        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
          (window as any).requestIdleCallback(() => void executeRender(), { timeout: 1000 });
        } else {
          setTimeout(() => void executeRender(), 0);
        }
      };

      scheduleTask();
    });

    this.pendingPromises.set(key, renderPromise);
    return renderPromise;
  }
}

export const lowResCache = new LowResCache(50);

export function renderLowResThumbnail(
  doc: PdfDocumentProxy,
  pageIndex: number,
  scale: number = 0.35
): Promise<string> {
  return lowResCache.renderLowResThumbnail(doc, pageIndex, scale);
}

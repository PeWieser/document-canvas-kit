import { exportPdf } from "./export";
import type { Annotation } from "./types";

export interface ExportWorkerRequest {
  type: "EXPORT_PDF";
  id: string;
  originalBytes: ArrayBuffer;
  pageOrder: number[];
  annotations: Annotation[];
}

export interface ExportWorkerProgressMessage {
  type: "EXPORT_PROGRESS";
  id: string;
  current: number;
  total: number;
}

export interface ExportWorkerSuccessMessage {
  type: "EXPORT_SUCCESS";
  id: string;
  pdfBytes: ArrayBuffer;
}

export interface ExportWorkerErrorMessage {
  type: "EXPORT_ERROR";
  id: string;
  error: string;
}

export type ExportWorkerResponse =
  | ExportWorkerProgressMessage
  | ExportWorkerSuccessMessage
  | ExportWorkerErrorMessage;

// WebWorker message handler
const ctx: Worker = self as any;

if (typeof self !== "undefined" && typeof window === "undefined") {
  ctx.addEventListener("message", async (event: MessageEvent<ExportWorkerRequest>) => {
    const { type, id, originalBytes, pageOrder, annotations } = event.data;
    if (type !== "EXPORT_PDF") return;

    try {
      const bytes = new Uint8Array(originalBytes);
      const result = await exportPdf(
        bytes,
        pageOrder,
        annotations,
        (current, total) => {
          const progressMsg: ExportWorkerProgressMessage = {
            type: "EXPORT_PROGRESS",
            id,
            current,
            total,
          };
          ctx.postMessage(progressMsg);
        }
      );

      const buffer = result.buffer.slice(
        result.byteOffset,
        result.byteOffset + result.byteLength
      ) as ArrayBuffer;

      const successMsg: ExportWorkerSuccessMessage = {
        type: "EXPORT_SUCCESS",
        id,
        pdfBytes: buffer,
      };

      ctx.postMessage(successMsg, [buffer]);
    } catch (err: any) {
      const errorMsg: ExportWorkerErrorMessage = {
        type: "EXPORT_ERROR",
        id,
        error: err?.message || String(err),
      };
      ctx.postMessage(errorMsg);
    }
  });
}

/**
 * Offloads PDF export operation to a background WebWorker thread.
 * Automatically falls back to main-thread export if WebWorker is unavailable.
 */
export async function exportPdfWithWorker(
  originalBytes: Uint8Array,
  pageOrder: number[],
  annotations: Annotation[],
  onProgress?: (current: number, total: number) => void
): Promise<Uint8Array> {
  const isTestEnv = typeof process !== "undefined" && process.env && process.env.VITEST;

  if (typeof Worker === "undefined" || isTestEnv) {
    return exportPdf(originalBytes, pageOrder, annotations, onProgress);
  }

  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(
        new URL("./export.worker.ts", import.meta.url),
        { type: "module" }
      );
      const id = Math.random().toString(36).slice(2);
      const buffer = originalBytes.buffer.slice(
        originalBytes.byteOffset,
        originalBytes.byteOffset + originalBytes.byteLength
      );

      worker.onmessage = (e: MessageEvent<ExportWorkerResponse>) => {
        const data = e.data;
        if (!data || data.id !== id) return;

        if (data.type === "EXPORT_PROGRESS") {
          onProgress?.(data.current, data.total);
        } else if (data.type === "EXPORT_SUCCESS") {
          worker.terminate();
          resolve(new Uint8Array(data.pdfBytes));
        } else if (data.type === "EXPORT_ERROR") {
          worker.terminate();
          reject(new Error(data.error));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        // Fallback to main thread on worker failure
        exportPdf(originalBytes, pageOrder, annotations, onProgress)
          .then(resolve)
          .catch(reject);
      };

      const req: ExportWorkerRequest = {
        type: "EXPORT_PDF",
        id,
        originalBytes: buffer,
        pageOrder,
        annotations,
      };

      worker.postMessage(req, [buffer]);
    } catch (err) {
      exportPdf(originalBytes, pageOrder, annotations, onProgress)
        .then(resolve)
        .catch(reject);
    }
  });
}

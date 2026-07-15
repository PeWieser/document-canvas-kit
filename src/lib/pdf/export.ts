import {
  PDFDocument,
  PDFName,
  PDFArray,
  PDFNumber,
  StandardFonts,
  rgb,
  LineCapStyle,
  PDFString,
  decodePDFRawStream,
  type PDFRawStream,
  type PDFRef,
  type PDFFont,
  type PDFPage,
  radians,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  tokenizeStream,
  filterRedactedText,
  serializeTokens,
  createInitialGraphicsState,
} from "./ContentStreamEditor";
import { loadPdfDocument, getPageTextItems, type LoadedTextItem } from "./pdfjs";
import { getFontBytes } from "./fontDetect";
import type { Annotation, Rect } from "./types";

function hexToRgb(hex: string) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h || "000000", 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

// Helvetica (WinAnsi) can only encode a subset of Unicode; drop the rest so
// drawText never throws mid-export.
function sanitize(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ch === "\n" || (code >= 0x20 && code <= 0xff)) out += ch;
    else out += "?";
  }
  return out;
}

function decodeContents(page: any): Uint8Array {
  const context = page.node.context;
  let raw = page.node.get(PDFName.of("Contents"));
  raw = context.lookup(raw);
  const parts: Uint8Array[] = [];
  const pushStream = (s: PDFRawStream) => {
    try {
      parts.push(decodePDFRawStream(s).decode());
    } catch {
      // ignore streams we cannot decode
    }
  };
  if (raw instanceof PDFArray) {
    for (const el of raw.asArray()) {
      const s = context.lookup(el) as PDFRawStream;
      if (s) pushStream(s);
    }
  } else if (raw) {
    pushStream(raw as PDFRawStream);
  }
  let total = 0;
  for (const p of parts) total += p.length + 1;
  const combined = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    combined.set(p, off);
    off += p.length;
    combined[off] = 0x0a;
    off += 1;
  }
  return combined;
}

function drawWrappedText(
  page: any,
  font: PDFFont,
  text: string,
  x: number,
  baselineTop: number,
  fontSize: number,
  color: ReturnType<typeof rgb>,
  angleRad: number = 0,
) {
  const lines = sanitize(text).split("\n");
  const lineHeight = fontSize * 1.2;
  const sin = Math.sin(angleRad);
  const cos = Math.cos(angleRad);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lx = x + i * lineHeight * sin;
    const ly = baselineTop - i * lineHeight * cos;
    page.drawText(line, {
      x: lx,
      y: ly,
      size: fontSize,
      font,
      color,
      rotate: radians(angleRad),
    });
  }
}

export interface ExportProgress {
  (done: number, total: number): void;
}

/** Resolve (and cache) an embedded pdf-lib font for a given family/style. */
function makeFontResolver(outDoc: PDFDocument, helvetica: Record<string, PDFFont>) {
  const cache = new Map<string, PDFFont>();
  const bytesCache = new Map<string, PDFFont>(); // keyed by byte-identity

  return async function resolve(
    family: string | undefined,
    bold?: boolean,
    italic?: boolean,
    originalBytes?: Uint8Array,
  ): Promise<PDFFont> {
    // 1) Original embedded font bytes → identical metrics (deckungsgleich).
    if (originalBytes && originalBytes.length > 4) {
      const key = `bytes:${originalBytes.byteLength}:${originalBytes[0]}:${originalBytes[originalBytes.length - 1]}`;
      const hit = bytesCache.get(key);
      if (hit) return hit;
      try {
        const embedded = await outDoc.embedFont(originalBytes, { subset: true });
        bytesCache.set(key, embedded);
        return embedded;
      } catch (e) {
        console.warn("original font embed failed, falling back", e);
      }
    }

    const key = `${family || ""}|${bold ? 1 : 0}|${italic ? 1 : 0}`;
    if (cache.has(key)) return cache.get(key)!;

    // 2) Web font (Bunny) fallback.
    if (family) {
      try {
        const bytes = await getFontBytes(family, bold, italic);
        if (bytes) {
          const embedded = await outDoc.embedFont(bytes, { subset: true });
          cache.set(key, embedded);
          return embedded;
        }
      } catch (e) {
        console.warn("font embed failed for", family, e);
      }
    }
    // 3) Fallback: closest Helvetica variant.
    const fb =
      bold && italic ? helvetica.bi : bold ? helvetica.b : italic ? helvetica.i : helvetica.r;
    cache.set(key, fb);
    return fb;
  };
}

async function embedImage(outDoc: PDFDocument, dataUrl: string) {
  const isPng = dataUrl.startsWith("data:image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return isPng ? outDoc.embedPng(arr) : outDoc.embedJpg(arr);
}

export async function exportPdf(
  originalBytes: Uint8Array,
  pageOrder: number[],
  annotations: Annotation[],
  onProgress?: ExportProgress,
): Promise<Uint8Array> {
  const pdfjsDoc = await loadPdfDocument(originalBytes.buffer.slice(0) as ArrayBuffer);
  const textItemsByPage = new Map<number, LoadedTextItem[]>();
  for (const pageId of new Set(pageOrder)) {
    const page = await pdfjsDoc.getPage(pageId + 1);
    textItemsByPage.set(pageId, await getPageTextItems(page));
  }

  const srcDoc = await PDFDocument.load(originalBytes);
  const outDoc = await PDFDocument.create();
  outDoc.registerFontkit(fontkit);
  const helvetica = {
    r: await outDoc.embedFont(StandardFonts.Helvetica),
    b: await outDoc.embedFont(StandardFonts.HelveticaBold),
    i: await outDoc.embedFont(StandardFonts.HelveticaOblique),
    bi: await outDoc.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const resolveFont = makeFontResolver(outDoc, helvetica);

  const copied = await outDoc.copyPages(srcDoc, pageOrder);

  const total = pageOrder.length;
  for (let displayIndex = 0; displayIndex < pageOrder.length; displayIndex++) {
    const pageId = pageOrder[displayIndex];
    const page = copied[displayIndex];
    outDoc.addPage(page);

    const pageAnnos = annotations.filter((a) => a.page === pageId);
    const redactRects: { x: number; y: number; x2: number; y2: number }[] = [];
    for (const a of pageAnnos) {
      if (a.kind === "redact" || a.kind === "textReplace") {
        redactRects.push({
          x: a.rect.x,
          y: a.rect.y,
          x2: a.rect.x + a.rect.w,
          y2: a.rect.y + a.rect.h,
        });
      }
    }

    // 1) Real redaction: strip glyphs from the content stream.
    if (redactRects.length > 0) {
      try {
        const content = decodeContents(page);
        const tokens = tokenizeStream(content);
        const filtered = filterRedactedText(
          tokens,
          redactRects,
          textItemsByPage.get(pageId),
          createInitialGraphicsState(),
        );
        const newBytes = serializeTokens(filtered);
        const rawStream = outDoc.context.stream(newBytes);
        const ref: PDFRef = outDoc.context.register(rawStream);
        page.node.set(PDFName.of("Contents"), ref);
      } catch (e) {
        console.error("redaction failed on page", pageId, e);
      }
    }

    // 2) Overlays drawn on top of the (now redacted) content.
    for (const a of pageAnnos) {
      if (a.kind === "highlight") {
        const col = hexToRgb(a.color);
        for (const r of a.rects) {
          page.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: col, opacity: 0.4 });
        }
      } else if (a.kind === "redact") {
        page.drawRectangle({
          x: a.rect.x,
          y: a.rect.y,
          width: a.rect.w,
          height: a.rect.h,
          color: rgb(0, 0, 0),
        });
      } else if (a.kind === "textReplace") {
        const font = await resolveFont(a.fontFamily, a.bold, a.italic, a.originalFontBytes);
        const angle = a.transform ? Math.atan2(a.transform[1], a.transform[0]) : 0;
        const x = a.transform ? a.transform[4] : a.rect.x;
        const y = a.transform ? a.transform[5] : a.rect.y + a.rect.h * 0.18;
        drawWrappedText(page, font, a.text, x, y, a.fontSize, hexToRgb(a.color), angle);
      } else if (a.kind === "textbox") {
        const font = await resolveFont(a.fontFamily, a.bold, a.italic);
        drawWrappedText(
          page,
          font,
          a.text,
          a.x,
          a.y - a.fontSize * 0.8,
          a.fontSize,
          hexToRgb(a.color),
        );
      } else if (a.kind === "image") {
        try {
          const img = await embedImage(outDoc, a.dataUrl);
          page.drawImage(img, { x: a.rect.x, y: a.rect.y, width: a.rect.w, height: a.rect.h });
        } catch (e) {
          console.warn("image draw failed", e);
        }
      } else if (a.kind === "pen") {
        const col = hexToRgb(a.color);
        for (let i = 1; i < a.points.length; i++) {
          const [x1, y1] = a.points[i - 1];
          const [x2, y2] = a.points[i];
          page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: a.size,
            color: col,
            lineCap: LineCapStyle.Round,
          });
        }
      } else if (a.kind === "comment") {
        const body = a.text + a.replies.map((r) => `\n\n↳ ${r.text}`).join("");
        const annotDict = outDoc.context.obj({
          Type: "Annot",
          Subtype: "Text",
          Name: "Comment",
          Open: false,
          Rect: [a.x, a.y - 18, a.x + 18, a.y],
          Contents: PDFString.of(sanitize(body)),
        });
        const annotRef = outDoc.context.register(annotDict);
        let annots = page.node.get(PDFName.of("Annots"));
        annots = annots ? outDoc.context.lookup(annots) : undefined;
        if (annots instanceof PDFArray) {
          annots.push(annotRef);
        } else {
          page.node.set(PDFName.of("Annots"), outDoc.context.obj([annotRef]));
        }
      }
    }

    onProgress?.(displayIndex + 1, total);
  }

  return outDoc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type { Rect };

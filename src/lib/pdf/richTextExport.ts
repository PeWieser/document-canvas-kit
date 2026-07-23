import type { TextRun, ParagraphStyle } from "./paragraphGroup";
import { wrapParagraph, type WrappedLine } from "./wordWrap";
import { rgb, type PDFPage, type PDFFont } from "pdf-lib";

export function hexToRgbComponents(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "#000000").replace("#", "").trim();
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("");
  }
  const n = parseInt(h || "000000", 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
  };
}

function escapePdfString(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export interface PdfTextOperatorResult {
  operators: string[];
  lines: WrappedLine[];
}

/**
 * Converts TextRun[] and WrappedLine[] into PDF text operators (TJ, Tj, Tf, Tm, rg, g).
 */
export function convertWrappedLinesToOperators(
  lines: WrappedLine[],
  startX: number,
  startY: number, // Top Y coordinate of paragraph in PDF user space
  fontNameMap: Record<string, string> = {}
): string[] {
  const ops: string[] = ["BT"];
  let currentFont: string | null = null;
  let currentFontSize: number | null = null;
  let currentColor: string | null = null;

  let currentY = startY;

  for (let lIdx = 0; lIdx < lines.length; lIdx++) {
    const line = lines[lIdx];
    const lineY = currentY - line.baselineOffset;
    let runX = startX + line.xOffset;

    for (const run of line.runs) {
      // Font operator Tf
      const fontKey = `${run.fontFamily || "Helvetica"}${run.bold ? "-Bold" : ""}${run.italic ? "-Oblique" : ""}`;
      const fontAlias = fontNameMap[fontKey] || fontNameMap[run.fontFamily || "Helvetica"] || "Helvetica";
      const fontSize = run.fontSize || 12;

      if (currentFont !== fontAlias || currentFontSize !== fontSize) {
        ops.push(`/${fontAlias} ${fontSize} Tf`);
        currentFont = fontAlias;
        currentFontSize = fontSize;
      }

      // Color operator rg / g
      const colorHex = run.color || "#000000";
      if (currentColor !== colorHex) {
        const { r, g, b } = hexToRgbComponents(colorHex);
        if (r === g && g === b) {
          ops.push(`${r.toFixed(3)} g`);
        } else {
          ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
        }
        currentColor = colorHex;
      }

      // Matrix operator Tm
      ops.push(`1 0 0 1 ${runX.toFixed(2)} ${lineY.toFixed(2)} Tm`);

      // Text operator Tj or TJ
      if (line.wordSpacing && line.wordSpacing > 0 && run.text.includes(" ")) {
        // Use TJ array with displacement
        const words = run.text.split(" ");
        const tjElements: string[] = [];
        for (let w = 0; w < words.length; w++) {
          if (w > 0) {
            // Displacement in thousandths of an em unit
            const displacement = -Math.round((line.wordSpacing / fontSize) * 1000);
            tjElements.push(`${displacement}`);
          }
          if (words[w]) {
            tjElements.push(`(${escapePdfString(words[w])})`);
          }
        }
        ops.push(`[${tjElements.join(" ")}] TJ`);
      } else {
        ops.push(`(${escapePdfString(run.text)}) Tj`);
      }

      runX += run.width;
    }

    currentY -= line.height;
  }

  ops.push("ET");
  return ops;
}

export function convertRunsToPdfOperators(
  runs: TextRun[],
  maxWidth: number,
  startX: number,
  startY: number,
  style?: ParagraphStyle,
  fontNameMap: Record<string, string> = {}
): PdfTextOperatorResult {
  const lineHeight = style?.lineHeight || 1.2;
  const alignment = style?.alignment || "left";
  const lines = wrapParagraph(runs, maxWidth, lineHeight, alignment);
  const operators = convertWrappedLinesToOperators(lines, startX, startY, fontNameMap);
  return { operators, lines };
}

/**
 * Draws a rich text paragraph onto a pdf-lib PDFPage.
 */
export async function drawRichTextParagraph(
  page: PDFPage,
  runs: TextRun[],
  x: number,
  y: number,
  maxWidth: number,
  style?: ParagraphStyle,
  resolveFont?: (family?: string, bold?: boolean, italic?: boolean) => Promise<PDFFont>
): Promise<void> {
  if (!runs || runs.length === 0) return;

  const lineHeight = style?.lineHeight || 1.2;
  const alignment = style?.alignment || "left";
  const lines = wrapParagraph(runs, maxWidth, lineHeight, alignment);

  let currentY = y;

  for (const line of lines) {
    let runX = x + line.xOffset;
    const lineY = currentY - line.baselineOffset;

    for (const run of line.runs) {
      const font = resolveFont
        ? await resolveFont(run.fontFamily, run.bold, run.italic)
        : undefined;
      const fontSize = run.fontSize || style?.fontSize || 12;
      const colorComp = hexToRgbComponents(run.color || style?.color || "#000000");
      const color = rgb(colorComp.r, colorComp.g, colorComp.b);

      if (font) {
        page.drawText(run.text, {
          x: runX,
          y: lineY,
          size: fontSize,
          font,
          color,
        });
      }

      // Draw underline if set
      if (run.underline) {
        page.drawLine({
          start: { x: runX, y: lineY - fontSize * 0.15 },
          end: { x: runX + run.width, y: lineY - fontSize * 0.15 },
          thickness: Math.max(0.5, fontSize * 0.07),
          color,
        });
      }

      // Draw strikethrough if set
      if (run.strikethrough) {
        page.drawLine({
          start: { x: runX, y: lineY + fontSize * 0.3 },
          end: { x: runX + run.width, y: lineY + fontSize * 0.3 },
          thickness: Math.max(0.5, fontSize * 0.07),
          color,
        });
      }

      runX += run.width;
    }

    currentY -= line.height;
  }
}

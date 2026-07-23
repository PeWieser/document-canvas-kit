import type { TextRun, ParagraphStyle } from "./paragraphGroup";

export interface WrappedRun extends TextRun {
  width: number;
}

export interface WrappedLine {
  runs: WrappedRun[];
  width: number;
  height: number;
  baselineOffset: number;
  xOffset: number;
  wordSpacing?: number;
}

let cachedCanvasCtx: CanvasRenderingContext2D | null = null;

export function measureTextWidth(
  text: string,
  fontFamily: string = "Helvetica",
  fontSize: number = 12,
  bold: boolean = false,
  italic: boolean = false
): number {
  if (!text) return 0;

  if (typeof document !== "undefined") {
    if (!cachedCanvasCtx) {
      const canvas = document.createElement("canvas");
      cachedCanvasCtx = canvas.getContext("2d");
    }
    if (cachedCanvasCtx) {
      const fontStyle = italic ? "italic" : "normal";
      const fontWeight = bold ? "bold" : "normal";
      cachedCanvasCtx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
      return cachedCanvasCtx.measureText(text).width;
    }
  }

  // Heuristic fallback for non-DOM environments
  const avgCharWidth = fontSize * 0.55;
  return text.length * avgCharWidth;
}

interface Token {
  text: string;
  run: TextRun;
  width: number;
  isNewline: boolean;
  isSpace: boolean;
}

export function wrapParagraph(
  runs: TextRun[],
  maxWidth: number,
  lineHeight: number = 1.2,
  alignment: ParagraphStyle["alignment"] = "left"
): WrappedLine[] {
  if (!runs || runs.length === 0) return [];

  // Break runs into tokens (words, spaces, newlines)
  const tokens: Token[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const lines = run.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        tokens.push({
          text: "\n",
          run,
          width: 0,
          isNewline: true,
          isSpace: false,
        });
      }
      const segment = lines[i];
      if (!segment) continue;

      // Tokenize by word boundaries, preserving spaces
      const parts = segment.match(/([^\s]+|\s+)/g) || [segment];
      for (const part of parts) {
        const isSpace = /^\s+$/.test(part);
        const font = run.fontFamily || "Helvetica";
        const size = run.fontSize || 12;
        const width = measureTextWidth(part, font, size, run.bold, run.italic);
        tokens.push({
          text: part,
          run,
          width,
          isNewline: false,
          isSpace,
        });
      }
    }
  }

  if (tokens.length === 0) return [];

  const lines: WrappedLine[] = [];
  let currentRuns: WrappedRun[] = [];
  let currentLineWidth = 0;
  let maxFontSize = 12;

  const pushCurrentLine = (isLastLineOfPara = false) => {
    if (currentRuns.length === 0) return;

    // Trim trailing space width from line total
    let trimmedWidth = currentLineWidth;
    while (currentRuns.length > 0 && /^\s+$/.test(currentRuns[currentRuns.length - 1].text)) {
      const popped = currentRuns.pop()!;
      trimmedWidth -= popped.width;
    }

    if (currentRuns.length === 0) return;

    const lineBoxHeight = maxFontSize * lineHeight;
    let xOffset = 0;

    const remainingWidth = Math.max(0, maxWidth - trimmedWidth);
    let wordSpacing: number | undefined;

    if (alignment === "center") {
      xOffset = remainingWidth / 2;
    } else if (alignment === "right") {
      xOffset = remainingWidth;
    } else if (alignment === "justify" && !isLastLineOfPara) {
      // Calculate space distribution for justification
      let spaceCount = 0;
      for (const r of currentRuns) {
        const matches = r.text.match(/\s/g);
        if (matches) {
          spaceCount += matches.length;
        }
      }
      if (spaceCount > 0) {
        wordSpacing = remainingWidth / spaceCount;
      }
    }

    lines.push({
      runs: currentRuns,
      width: trimmedWidth,
      height: lineBoxHeight,
      baselineOffset: maxFontSize * 0.8,
      xOffset,
      wordSpacing,
    });

    currentRuns = [];
    currentLineWidth = 0;
    maxFontSize = 12;
  };

  const effectiveMaxWidth = maxWidth > 0 ? maxWidth : Infinity;

  for (const token of tokens) {
    if (token.isNewline) {
      pushCurrentLine(true);
      continue;
    }

    // Check if token fits in current line
    if (
      currentLineWidth + token.width > effectiveMaxWidth &&
      currentRuns.length > 0
    ) {
      // If token is a space at start of wrapped line, ignore leading space
      if (token.isSpace) {
        continue;
      }
      pushCurrentLine(false);
    }

    // Append token to current line runs (merge with last run if same style)
    const runFontSize = token.run.fontSize || 12;
    maxFontSize = Math.max(maxFontSize, runFontSize);

    const wrappedRun: WrappedRun = {
      ...token.run,
      text: token.text,
      width: token.width,
    };

    if (currentRuns.length > 0) {
      const last = currentRuns[currentRuns.length - 1];
      if (isSameRunStyle(last, wrappedRun)) {
        last.text += wrappedRun.text;
        last.width += wrappedRun.width;
      } else {
        currentRuns.push(wrappedRun);
      }
    } else {
      currentRuns.push(wrappedRun);
    }

    currentLineWidth += token.width;
  }

  pushCurrentLine(true);

  return lines;
}

function isSameRunStyle(a: TextRun, b: TextRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strikethrough === !!b.strikethrough &&
    !!a.superscript === !!b.superscript &&
    !!a.subscript === !!b.subscript &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color
  );
}

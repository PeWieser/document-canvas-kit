/**
 * Paragraph and Line Detection Engine for PDF Text Items.
 * Automatically groups individual PDF text items into lines and multi-line paragraphs.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  superscript?: boolean;
  subscript?: boolean;
}

export interface ParagraphStyle {
  alignment: "left" | "center" | "right" | "justify";
  lineHeight: number;
  paragraphSpacing?: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
}

export interface ParagraphLine {
  text: string;
  itemIndices: number[];
  transform: number[];
  width: number;
  runs?: TextRun[];
}

export interface ParagraphGroup {
  id: string;
  lines: ParagraphLine[];
  fullText: string;
  bounds: { x: number; y: number; w: number; h: number }; // In PDF user space
  fontSize: number;
  fontName: string;
  lineHeight: number;
  transform: number[];
  runs?: TextRun[];
  style?: ParagraphStyle;
}

export function detectParagraphs(rawItems: any[]): ParagraphGroup[] {
  if (!rawItems || !rawItems.length) return [];

  // Filter out empty items
  const validItems = rawItems
    .map((item, originalIndex) => ({ item, originalIndex }))
    .filter(({ item }) => item && typeof item.str === "string" && item.str.trim().length > 0);

  if (!validItems.length) return [];

  // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
  const sorted = [...validItems].sort((a, b) => {
    const yA = a.item.transform[5];
    const yB = b.item.transform[5];
    const fontA = Math.hypot(a.item.transform[0], a.item.transform[1]) || 12;
    const fontB = Math.hypot(b.item.transform[0], b.item.transform[1]) || 12;
    const fontSize = Math.max(fontA, fontB);
    const yTol = Math.max(4, fontSize * 0.4);
    if (Math.abs(yA - yB) > yTol) {
      return yB - yA; // Higher Y comes first (top of page)
    }
    return a.item.transform[4] - b.item.transform[4]; // Left to right
  });

  // Step 1: Group items into single lines
  const lines: ParagraphLine[] = [];
  let currentLineItems: { item: any; originalIndex: number }[] = [];

  for (const entry of sorted) {
    if (currentLineItems.length === 0) {
      currentLineItems.push(entry);
    } else {
      const prevY = currentLineItems[0].item.transform[5];
      const currY = entry.item.transform[5];
      const fontSize = Math.hypot(currentLineItems[0].item.transform[0], currentLineItems[0].item.transform[1]) || 12;
      const yTol = Math.max(4, fontSize * 0.4);

      if (Math.abs(prevY - currY) <= yTol) {
        currentLineItems.push(entry);
      } else {
        // Finalize line
        lines.push(createLineFromItems(currentLineItems));
        currentLineItems = [entry];
      }
    }
  }

  if (currentLineItems.length > 0) {
    lines.push(createLineFromItems(currentLineItems));
  }

  // Step 2: Group consecutive lines into Paragraphs
  const paragraphs: ParagraphGroup[] = [];
  let currentParaLines: ParagraphLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (currentParaLines.length === 0) {
      currentParaLines.push(line);
    } else {
      const prevLine = currentParaLines[currentParaLines.length - 1];
      const prevY = prevLine.transform[5];
      const currY = line.transform[5];
      const deltaY = prevY - currY;

      const fontSize = Math.hypot(line.transform[0], line.transform[1]) || 12;
      const prevFontSize = Math.hypot(prevLine.transform[0], prevLine.transform[1]) || 12;

      const sameFont = Math.abs(fontSize - prevFontSize) <= 2;
      const isNormalGap = deltaY >= fontSize * 0.8 && deltaY <= fontSize * 1.5;
      const leftAligned = Math.abs(line.transform[4] - prevLine.transform[4]) <= 30;

      if (sameFont && isNormalGap && leftAligned) {
        currentParaLines.push(line);
      } else {
        paragraphs.push(createParagraphFromLines(currentParaLines));
        currentParaLines = [line];
      }
    }
  }

  if (currentParaLines.length > 0) {
    paragraphs.push(createParagraphFromLines(currentParaLines));
  }

  return paragraphs;
}

function createLineFromItems(entries: { item: any; originalIndex: number }[]): ParagraphLine {
  // Sort entries left-to-right
  entries.sort((a, b) => a.item.transform[4] - b.item.transform[4]);

  let combinedText = "";
  const itemIndices: number[] = [];
  let minX = Infinity;
  let maxX = -Infinity;

  entries.forEach(({ item, originalIndex }, i) => {
    itemIndices.push(originalIndex);
    const x = item.transform[4];
    const w = item.width || 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + w);

    if (i > 0) {
      const prev = entries[i - 1].item;
      const prevEnd = prev.transform[4] + (prev.width || 0);
      const gap = x - prevEnd;
      const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12;
      if (gap >= fontSize * 0.3 && !combinedText.endsWith(" ") && !item.str.startsWith(" ")) {
        combinedText += " ";
      }
    }
    combinedText += item.str;
  });

  const firstItem = entries[0].item;
  return {
    text: combinedText,
    itemIndices,
    transform: [firstItem.transform[0], firstItem.transform[1], firstItem.transform[2], firstItem.transform[3], minX, firstItem.transform[5]],
    width: Math.max(10, maxX - minX),
  };
}

function createParagraphFromLines(lines: ParagraphLine[]): ParagraphGroup {
  const fullText = lines.map((l) => l.text).join("\n");
  const firstLine = lines[0];
  const fontSize = Math.hypot(firstLine.transform[0], firstLine.transform[1]) || 12;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  lines.forEach((l) => {
    const x = l.transform[4];
    const y = l.transform[5];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + l.width);
    minY = Math.min(minY, y - fontSize);
    maxY = Math.max(maxY, y);
  });

  let avgLineHeight = fontSize * 1.2;
  if (lines.length > 1) {
    const totalGap = firstLine.transform[5] - lines[lines.length - 1].transform[5];
    avgLineHeight = totalGap / (lines.length - 1);
  }
  avgLineHeight = Math.min(avgLineHeight, fontSize * 1.3);

  const fontName = (firstLine as any).fontName || "";
  const runs: TextRun[] = [
    {
      text: fullText,
      fontFamily: fontName,
      fontSize,
    },
  ];

  const style: ParagraphStyle = {
    alignment: "left",
    lineHeight: avgLineHeight / fontSize,
    fontSize,
    fontFamily: fontName,
  };

  return {
    id: `para-${firstLine.itemIndices.join("-")}`,
    lines,
    fullText,
    bounds: {
      x: minX,
      y: minY,
      w: Math.max(20, maxX - minX),
      h: Math.max(fontSize, maxY - minY),
    },
    fontSize,
    fontName,
    lineHeight: avgLineHeight,
    transform: firstLine.transform,
    runs,
    style,
  };
}

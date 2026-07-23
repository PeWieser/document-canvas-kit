import { describe, it, expect } from "vitest";
import { wrapParagraph, measureTextWidth } from "../../lib/pdf/wordWrap";
import type { TextRun } from "../../lib/pdf/paragraphGroup";

describe("Word Wrap Engine (InDesign-Style)", () => {
  it("measures text width accurately", () => {
    const width = measureTextWidth("Hello World", "Helvetica", 12, false, false);
    expect(width).toBeGreaterThan(0);
  });

  it("wraps single-run paragraph text into multiple lines when exceeding maxWidth", () => {
    const runs: TextRun[] = [
      { text: "The quick brown fox jumps over the lazy dog repeatedly.", fontSize: 12 },
    ];
    // With maxWidth 100, "The quick brown fox jumps over the lazy dog repeatedly." should wrap into multiple lines
    const lines = wrapParagraph(runs, 100, 1.2, "left");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.runs.length).toBeGreaterThan(0);
    }
  });

  it("calculates alignment xOffset for center and right alignments", () => {
    const runs: TextRun[] = [{ text: "Short text", fontSize: 12 }];
    const leftLines = wrapParagraph(runs, 200, 1.2, "left");
    const centerLines = wrapParagraph(runs, 200, 1.2, "center");
    const rightLines = wrapParagraph(runs, 200, 1.2, "right");

    expect(leftLines[0].xOffset).toBe(0);
    expect(centerLines[0].xOffset).toBeGreaterThan(0);
    expect(rightLines[0].xOffset).toBeGreaterThan(centerLines[0].xOffset);
  });

  it("calculates wordSpacing for justified text", () => {
    const runs: TextRun[] = [
      { text: "Word1 Word2 Word3 Word4 Word5 Word6 Word7 Word8 Word9 Word10", fontSize: 12 },
    ];
    const lines = wrapParagraph(runs, 150, 1.2, "justify");
    expect(lines.length).toBeGreaterThan(1);
    // The first line (not the last line) of justified text should have wordSpacing
    expect(lines[0].wordSpacing).toBeGreaterThan(0);
  });

  it("handles empty runs gracefully", () => {
    const lines = wrapParagraph([], 100);
    expect(lines).toEqual([]);
  });
});

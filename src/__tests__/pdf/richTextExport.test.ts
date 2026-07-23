import { describe, it, expect } from "vitest";
import { convertRunsToPdfOperators, convertWrappedLinesToOperators, hexToRgbComponents } from "../../lib/pdf/richTextExport";
import type { TextRun } from "../../lib/pdf/paragraphGroup";

describe("Rich-Text Export Operator Engine", () => {
  it("converts hex color to RGB 0-1 scale components", () => {
    const black = hexToRgbComponents("#000000");
    expect(black).toEqual({ r: 0, g: 0, b: 0 });

    const red = hexToRgbComponents("#ff0000");
    expect(red).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("generates correct PDF operators (BT, Tf, Tm, Tj, ET) for text runs", () => {
    const runs: TextRun[] = [
      { text: "Hello ", bold: true, fontSize: 14, color: "#111111" },
      { text: "World", italic: true, fontSize: 14, color: "#2563eb" },
    ];

    const result = convertRunsToPdfOperators(runs, 300, 100, 700);
    expect(result.operators).toContain("BT");
    expect(result.operators).toContain("ET");

    const textOps = result.operators.filter((op) => op.endsWith("Tj") || op.endsWith("TJ"));
    expect(textOps.length).toBeGreaterThan(0);

    const tfOps = result.operators.filter((op) => op.endsWith("Tf"));
    expect(tfOps.length).toBeGreaterThan(0);

    const tmOps = result.operators.filter((op) => op.endsWith("Tm"));
    expect(tmOps.length).toBeGreaterThan(0);
  });
});

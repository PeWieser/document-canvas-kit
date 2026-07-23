import { describe, it, expect } from "vitest";
import { tokenizeStream } from "../../lib/pdf/ContentStreamEditor";
import { detectVectorElements, extractVectorBounds, isVectorOperator } from "../../lib/pdf/vectorDetection";
import { removeVectorOperators } from "../../lib/pdf/ContentStreamEditor";

describe("Phase D: Vector & Image Manipulation Overhaul", () => {
  it("detects vector operators and calculates bounds correctly", () => {
    // PDF content stream containing rectangle (10 20 100 50 re f) and lineto (0 0 m 30 40 l S)
    const stream = new TextEncoder().encode("10 20 100 50 re f\n0 0 m 30 40 l S");
    const tokens = tokenizeStream(stream);

    const elements = detectVectorElements(tokens);
    expect(elements).toHaveLength(2);

    // Element 1: Rectangle at (10, 20) width 100 height 50 -> min (10, 20), max (110, 70)
    expect(elements[0].bounds).toEqual({ minX: 10, minY: 20, maxX: 110, maxY: 70 });
    expect(elements[0].closed).toBe(true);

    // Element 2: Line from (0, 0) to (30, 40) -> min (0, 0), max (30, 40)
    expect(elements[1].bounds).toEqual({ minX: 0, minY: 0, maxX: 30, maxY: 40 });
  });

  it("extracts vector bounds correctly", () => {
    const stream = new TextEncoder().encode("5 5 m 15 25 l S");
    const tokens = tokenizeStream(stream);
    const bounds = extractVectorBounds(tokens);

    expect(bounds).toHaveLength(1);
    expect(bounds[0]).toEqual({ minX: 5, minY: 5, maxX: 15, maxY: 25 });
  });

  it("checks vector operator validity", () => {
    expect(isVectorOperator("m")).toBe(true);
    expect(isVectorOperator("l")).toBe(true);
    expect(isVectorOperator("c")).toBe(true);
    expect(isVectorOperator("v")).toBe(true);
    expect(isVectorOperator("y")).toBe(true);
    expect(isVectorOperator("h")).toBe(true);
    expect(isVectorOperator("S")).toBe(true);
    expect(isVectorOperator("f")).toBe(true);
    expect(isVectorOperator("B")).toBe(true);
    expect(isVectorOperator("Tj")).toBe(false);
  });

  it("physically strips vector tokens using removeVectorOperators", () => {
    const stream = new TextEncoder().encode("10 20 100 50 re f\n0 0 m 30 40 l S");
    const tokens = tokenizeStream(stream);

    const targetBounds = { minX: 10, minY: 20, maxX: 110, maxY: 70 };
    const filteredTokens = removeVectorOperators(tokens, targetBounds);

    // The rect tokens should be stripped, leaving only the line tokens (0 0 m 30 40 l S)
    const remainingText = filteredTokens.map((t) => t.text || new TextDecoder().decode(t.raw)).join("");
    expect(remainingText).not.toContain("re");
    expect(remainingText).toContain("m");
    expect(remainingText).toContain("S");
  });
});

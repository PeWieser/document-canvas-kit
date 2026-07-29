import { describe, it, expect } from "vitest";
import { computeDomTopFromBaseline, computeAlignmentMetrics } from "../../lib/pdf/alignmentEngine";

describe("Text Replace Vertical Alignment & Baseline Calculation", () => {
  describe("computeDomTopFromBaseline", () => {
    it("computes DOM top position with default line-height (1) and padding (0)", () => {
      // baselineY = 100, fontHeight = 16, ascentRatio = 0.8
      // expected: 100 - (16 * 0.8) - 0 - 0 = 87.2
      const result = computeDomTopFromBaseline(100, 16, 0.8);
      expect(result).toBeCloseTo(87.2, 5);
    });

    it("accounts for CSS line-height leading accurately", () => {
      // fontHeight = 20, lineHeight = 1.2
      // leading = (20 * 0.2) / 2 = 2
      // baselineY = 200, ascentRatio = 0.75
      // expected: 200 - (20 * 0.75) - 2 - 0 = 183
      const result = computeDomTopFromBaseline(200, 20, 0.75, 1.2, 0);
      expect(result).toBeCloseTo(183, 5);
    });

    it("accounts for vertical paddingTop correctly", () => {
      // fontHeight = 20, lineHeight = 1, paddingTop = 5
      // expected: 200 - (20 * 0.75) - 0 - 5 = 180
      const result = computeDomTopFromBaseline(200, 20, 0.75, 1, 5);
      expect(result).toBeCloseTo(180, 5);
    });

    it("handles combined line-height leading and paddingTop", () => {
      // fontHeight = 24, lineHeight = 1.5, paddingTop = 4
      // leading = (24 * 0.5) / 2 = 6
      // baselineY = 300, ascentRatio = 0.8
      // expected: 300 - (24 * 0.8) - 6 - 4 = 270.8
      const result = computeDomTopFromBaseline(300, 24, 0.8, 1.5, 4);
      expect(result).toBeCloseTo(270.8, 5);
    });

    it("clamps negative leading when lineHeight < 1", () => {
      // lineHeight = 0.8 -> Math.max(0, 0.8 - 1) = 0
      // expected: 100 - (16 * 0.8) - 0 - 0 = 87.2
      const result = computeDomTopFromBaseline(100, 16, 0.8, 0.8, 0);
      expect(result).toBeCloseTo(87.2, 5);
    });
  });

  describe("computeAlignmentMetrics Integration", () => {
    it("calls computeDomTopFromBaseline during alignment metrics calculation", () => {
      const item = {
        str: "Alignment Test",
        transform: [10, 0, 0, 10, 50, 150],
        width: 100,
      };
      const viewport = {
        transform: [1, 0, 0, 1, 0, 0],
        scale: 1,
      };
      const pdfFontMetrics = {
        ascent: 0.8,
        descent: -0.2,
        ascentRatio: 0.8,
      };

      const metrics = computeAlignmentMetrics(item, viewport, pdfFontMetrics);

      // tx[5] = 150, fontHeight = 10, ascentRatio = 0.8
      // computeDomTopFromBaseline(150, 10, 0.8) = 150 - 8 = 142
      expect(metrics.domTop).toBeCloseTo(142, 5);
    });
  });
});

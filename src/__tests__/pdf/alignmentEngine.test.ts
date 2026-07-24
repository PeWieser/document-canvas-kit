import { describe, it, expect } from "vitest";
import { extractFontMetrics } from "../../lib/pdf/fontMetrics";
import { computeAlignmentMetrics, predictWidthFromFontMetrics } from "../../lib/pdf/alignmentEngine";

describe("Phase B Alignment Engine & Font Metrics", () => {
  describe("predictWidthFromFontMetrics", () => {
    it("returns null when text or metrics are missing", () => {
      expect(predictWidthFromFontMetrics("", 12, null)).toBeNull();
      expect(predictWidthFromFontMetrics("A", 12, null)).toBeNull();
      expect(predictWidthFromFontMetrics("A", 12, { ascent: 0.8, descent: -0.2, ascentRatio: 0.8 })).toBeNull();
    });

    it("predicts text width from charWidths array", () => {
      const metrics = {
        ascent: 0.8,
        descent: -0.2,
        ascentRatio: 0.8,
        unitsPerEm: 1000,
        charWidths: { 65: 600, 66: 700 }, // 'A': 600, 'B': 700
      };
      // For 'AB' at fontHeight 10: (600 + 700) / 1000 * 10 = 13
      const width = predictWidthFromFontMetrics("AB", 10, metrics);
      expect(width).toBeCloseTo(13, 4);
    });
  });

  describe("extractFontMetrics", () => {
    it("returns null for missing page or fontName", async () => {
      expect(await extractFontMetrics(null as any, "font1")).toBeNull();
      expect(await extractFontMetrics({} as any, "")).toBeNull();
    });

    it("extracts ascent, descent, ascentRatio, bbox, unitsPerEm, charWidths from commonObjs", async () => {
      const mockPage = {
        commonObjs: {
          has: (name: string) => name === "g1",
          get: (name: string) => {
            if (name === "g1") {
              return {
                ascent: 0.8,
                descent: -0.2,
                bbox: [-100, -200, 1000, 800],
                unitsPerEm: 1000,
                widths: { 65: 600 },
              };
            }
            return null;
          },
        },
      };

      const metrics = await extractFontMetrics(mockPage as any, "g1");
      expect(metrics).not.toBeNull();
      expect(metrics?.ascent).toBe(0.8);
      expect(metrics?.descent).toBe(-0.2);
      expect(metrics?.ascentRatio).toBeCloseTo(0.8, 5);
      expect(metrics?.bbox).toEqual([-100, -200, 1000, 800]);
      expect(metrics?.unitsPerEm).toBe(1000);
      expect(metrics?.charWidths).toEqual({ 65: 600 });
    });

    it("normalizes positive descent values correctly", async () => {
      const mockPage = {
        commonObjs: {
          has: () => true,
          get: () => ({
            ascent: 800,
            descent: 200,
            unitsPerEm: 1000,
          }),
        },
      };

      const metrics = await extractFontMetrics(mockPage as any, "g2");
      expect(metrics?.descent).toBe(-200);
      expect(metrics?.ascentRatio).toBeCloseTo(0.8, 5);
    });
  });

  describe("computeAlignmentMetrics", () => {
    it("calculates subpixel precise domTop, domLeft, domHeight, domWidth, domLineHeight, and domPaddingTop", () => {
      const item = {
        str: "Test Alignment",
        transform: [12, 0, 0, 12, 100, 200],
        width: 150,
      };
      const viewport = {
        transform: [1.5, 0, 0, -1.5, 0, 600],
        scale: 1.5,
      };
      const pdfFontMetrics = {
        ascent: 0.8,
        descent: -0.2,
        ascentRatio: 0.8,
      };

      const result = computeAlignmentMetrics(item, viewport, pdfFontMetrics);

      // tx matrix calculation:
      // tx[4] = 1.5 * 100 + 0 * 200 + 0 = 150 (domLeft)
      // tx[5] = 0 * 100 + (-1.5) * 200 + 600 = 300 (baseline Y on screen)
      // fontHeight = Math.hypot(0, -18) = 18
      // domTop = tx[5] - fontHeight * ascentRatio = 300 - 18 * 0.8 = 285.6
      expect(result.domLeft).toBe(150);
      expect(result.domHeight).toBe(18);
      expect(result.domTop).toBeCloseTo(285.6, 4);
      expect(result.domWidth).toBe(150 * 1.5);
      expect(result.domLineHeight).toBe(18);
      expect(result.domPaddingTop).toBe(0);
      expect(result.ascentRatio).toBe(0.8);
      expect(result.initialScaleX).toBeGreaterThan(0);
    });

    it("uses default ascentRatio (0.8) when pdfFontMetrics is null", () => {
      const item = {
        str: "Hello",
        transform: [10, 0, 0, 10, 50, 100],
        width: 40,
      };
      const viewport = {
        transform: [1, 0, 0, 1, 0, 0],
        scale: 1,
      };

      const result = computeAlignmentMetrics(item, viewport, null);
      // fontHeight = 10
      // domTop = 100 - 10 * 0.8 = 92
      expect(result.domTop).toBe(92);
      expect(result.ascentRatio).toBe(0.8);
    });
  });
});

import { describe, expect, it } from "vitest";
import { computeDomTopFromBaseline } from "@/lib/pdf/alignmentEngine";

describe("textReplace vertical baseline alignment", () => {
  it("compensates textarea padding and line-height leading so the visual text baseline stays fixed", () => {
    const baselineY = 762.949;
    const fontHeight = 24;
    const ascentRatio = 0.8026048026048026;
    const lineHeight = 1.15;
    const paddingTop = 2;

    const top = computeDomTopFromBaseline(
      baselineY,
      fontHeight,
      ascentRatio,
      lineHeight,
      paddingTop,
    );
    const leading = (fontHeight * (lineHeight - 1)) / 2;
    const reconstructedBaseline = top + paddingTop + leading + fontHeight * ascentRatio;

    expect(reconstructedBaseline).toBeCloseTo(baselineY, 6);
  });

  it("matches the previous box-top formula when no CSS inline offsets are applied", () => {
    expect(computeDomTopFromBaseline(100, 20, 0.8)).toBe(84);
  });
});

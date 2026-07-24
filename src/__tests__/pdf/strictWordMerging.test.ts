import { describe, it, expect } from "vitest";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height?: number;
  fontName?: string;
}

function mergeWordFragments(items: TextItem[], idx: number) {
  const targetItem = items[idx];
  const targetFontSize =
    Math.hypot(targetItem.transform[2], targetItem.transform[3]) ||
    Math.hypot(targetItem.transform[0], targetItem.transform[1]) ||
    12;
  const targetBaselineY = targetItem.transform[5];

  const candidates = items.filter((it) => {
    if (!it || typeof it.str !== "string" || !it.str) return false;
    if (it.fontName !== targetItem.fontName) return false;
    const itemFontSize =
      Math.hypot(it.transform[2], it.transform[3]) ||
      Math.hypot(it.transform[0], it.transform[1]) ||
      12;
    if (Math.abs(itemFontSize - targetFontSize) >= 0.5) return false;
    const itemBaselineY = it.transform[5];
    if (Math.abs(itemBaselineY - targetBaselineY) >= 1.0) return false;
    return true;
  });

  candidates.sort((a, b) => a.transform[4] - b.transform[4]);

  const targetCandIdx = candidates.indexOf(targetItem);
  let mergedItems: TextItem[] = [targetItem];

  if (targetCandIdx !== -1) {
    let leftIdx = targetCandIdx;
    while (leftIdx > 0) {
      const curr = candidates[leftIdx];
      const prev = candidates[leftIdx - 1];
      const gap = curr.transform[4] - (prev.transform[4] + prev.width);
      if (gap < targetFontSize * 0.4 && !prev.str.endsWith(" ") && !curr.str.startsWith(" ")) {
        leftIdx--;
      } else {
        break;
      }
    }

    let rightIdx = targetCandIdx;
    while (rightIdx < candidates.length - 1) {
      const curr = candidates[rightIdx];
      const next = candidates[rightIdx + 1];
      const gap = next.transform[4] - (curr.transform[4] + curr.width);
      if (gap < targetFontSize * 0.4 && !curr.str.endsWith(" ") && !next.str.startsWith(" ")) {
        rightIdx++;
      } else {
        break;
      }
    }

    mergedItems = candidates.slice(leftIdx, rightIdx + 1);
  }

  const mergedText = mergedItems.map((it) => it.str).join("");
  const minX = mergedItems[0].transform[4];
  const maxX =
    mergedItems[mergedItems.length - 1].transform[4] +
    mergedItems[mergedItems.length - 1].width;
  const mergedWidth = Math.max(1, maxX - minX);

  return {
    mergedText,
    mergedWidth,
    fontHeight: targetFontSize,
    mergedItemsCount: mergedItems.length,
  };
}

describe("Strict Same-Font Tight Word Merging", () => {
  it("merges matching contiguous word fragments of the same word", () => {
    const items: TextItem[] = [
      { str: "F", transform: [36, 0, 0, 36, 100, 700], width: 22, fontName: "ArialBold" },
      { str: "ARBMANAGEMEN", transform: [36, 0, 0, 36, 122, 700], width: 250, fontName: "ArialBold" },
      { str: "T", transform: [36, 0, 0, 36, 372, 700], width: 20, fontName: "ArialBold" },
    ];

    const result = mergeWordFragments(items, 0);
    expect(result.mergedText).toBe("FARBMANAGEMENT");
    expect(result.mergedItemsCount).toBe(3);
    expect(result.mergedWidth).toBe(292);
    expect(result.fontHeight).toBe(36);
  });

  it("keeps items with different fontName separate (e.g. BUCH 3)", () => {
    const items: TextItem[] = [
      { str: "BUCH ", transform: [14, 0, 0, 14, 100, 500], width: 45, fontName: "Font_Bold" },
      { str: "3", transform: [14, 0, 0, 14, 148, 500], width: 10, fontName: "Font_Regular" },
    ];

    const buchResult = mergeWordFragments(items, 0);
    expect(buchResult.mergedText).toBe("BUCH ");
    expect(buchResult.mergedItemsCount).toBe(1);

    const digitResult = mergeWordFragments(items, 1);
    expect(digitResult.mergedText).toBe("3");
    expect(digitResult.mergedItemsCount).toBe(1);
  });

  it("keeps words separated by a space/gap separate even if same font", () => {
    const items: TextItem[] = [
      { str: "FIRST", transform: [12, 0, 0, 12, 100, 500], width: 35, fontName: "F1" },
      { str: "SECOND", transform: [12, 0, 0, 12, 150, 500], width: 42, fontName: "F1" },
    ];

    // gap = 150 - 135 = 15 > 12 * 0.4 (4.8)
    const result = mergeWordFragments(items, 0);
    expect(result.mergedText).toBe("FIRST");
    expect(result.mergedItemsCount).toBe(1);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateDropInsertionIndex,
  getActivePasteSlot,
} from "@/components/editor/GridOverview";
import { LowResCache, lowResCache, renderLowResThumbnail } from "@/lib/pdf/lowResCache";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";

describe("gridDropJump & lowResCache unit tests", () => {
  describe("50% Page-Center Midpoint Calculation (GridOverview)", () => {
    const itemIndex = 3;
    const itemRect = { left: 100, right: 300 }; // Center midpoint is 200

    it("hovering left of center yields item.index", () => {
      // 150 < 200 (left of midpoint)
      const insertionIndexLeft = calculateDropInsertionIndex(itemRect, 150, itemIndex);
      expect(insertionIndexLeft).toBe(itemIndex);

      // 199 < 200 (just left of midpoint)
      const insertionIndexJustLeft = calculateDropInsertionIndex(itemRect, 199, itemIndex);
      expect(insertionIndexJustLeft).toBe(itemIndex);
    });

    it("hovering right of center yields item.index + 1", () => {
      // 200 >= 200 (at midpoint)
      const insertionIndexAtMid = calculateDropInsertionIndex(itemRect, 200, itemIndex);
      expect(insertionIndexAtMid).toBe(itemIndex + 1);

      // 250 > 200 (right of midpoint)
      const insertionIndexRight = calculateDropInsertionIndex(itemRect, 250, itemIndex);
      expect(insertionIndexRight).toBe(itemIndex + 1);
    });
  });

  describe("activePasteSlot Selection (GridOverview)", () => {
    it("selects dropInsertionIndex when dropInsertionIndex is set", () => {
      const slot = getActivePasteSlot(2, new Set([0, 1]), 0, 10);
      expect(slot).toBe(2);
    });

    it("selects maxSelected + 1 when selectedIndices is non-empty and no drop position", () => {
      const slot = getActivePasteSlot(null, new Set([1, 4, 2]), null, 10);
      expect(slot).toBe(5);
    });

    it("selects lastClickedIndex + 1 when selectedIndices is empty and lastClickedIndex is set", () => {
      const slot = getActivePasteSlot(null, new Set(), 3, 10);
      expect(slot).toBe(4);
    });

    it("defaults to totalPages when no active drop position or selection exists", () => {
      const slot = getActivePasteSlot(null, new Set(), null, 8);
      expect(slot).toBe(8);
    });
  });

  describe("LRU Thumbnail Caching (lowResCache.ts)", () => {
    beforeEach(() => {
      lowResCache.clear();
      lowResCache.setMaxSize(50);
    });

    it("caches thumbnails and enforces LRU capacity", () => {
      const customCache = new LowResCache(2);
      customCache.set("page1", "data:image/png;base64,page1");
      customCache.set("page2", "data:image/png;base64,page2");

      expect(customCache.size).toBe(2);
      expect(customCache.get("page1")).toBe("data:image/png;base64,page1");

      // Refreshing page1 moves it to MRU, so adding page3 evicts page2
      customCache.set("page3", "data:image/png;base64,page3");

      expect(customCache.size).toBe(2);
      expect(customCache.has("page2")).toBe(false);
      expect(customCache.has("page1")).toBe(true);
      expect(customCache.has("page3")).toBe(true);
    });

    it("renders thumbnail once and serves subsequent requests from LRU cache", async () => {
      if (typeof HTMLCanvasElement !== "undefined") {
        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
          drawImage: vi.fn(),
        });
        HTMLCanvasElement.prototype.toDataURL = vi
          .fn()
          .mockReturnValue("data:image/png;base64,cachedCanvasData");
      }

      const renderFn = vi.fn().mockReturnValue({ promise: Promise.resolve() });
      const getViewportFn = vi.fn().mockReturnValue({ width: 280, height: 400 });

      const mockDoc = {
        fingerprints: ["doc-grid-test"],
        getPage: vi.fn().mockResolvedValue({
          getViewport: getViewportFn,
          render: renderFn,
        }),
      } as unknown as PdfDocumentProxy;

      const scale = 0.47; // e.g. for pagesPerRow 3..4 (280px)
      const dataUrl1 = await renderLowResThumbnail(mockDoc, 1, scale);
      expect(dataUrl1).toBe("data:image/png;base64,cachedCanvasData");
      expect(mockDoc.getPage).toHaveBeenCalledTimes(1);

      // Second call for same page and scale must hit LRU cache without re-rendering
      const dataUrl2 = await renderLowResThumbnail(mockDoc, 1, scale);
      expect(dataUrl2).toBe("data:image/png;base64,cachedCanvasData");
      expect(mockDoc.getPage).toHaveBeenCalledTimes(1);
    });
  });
});

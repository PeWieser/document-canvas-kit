import { describe, it, expect, beforeEach, vi } from "vitest";
import { LowResCache, lowResCache, renderLowResThumbnail } from "@/lib/pdf/lowResCache";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";

describe("LowResCache & lowResCache singleton", () => {
  beforeEach(() => {
    lowResCache.clear();
    lowResCache.setMaxSize(50);
  });

  it("stores and retrieves thumbnails by key", () => {
    const key = "doc1_page_0_scale_0.35";
    const dummyUrl = "data:image/png;base64,dummydata123";

    lowResCache.set(key, dummyUrl);

    expect(lowResCache.has(key)).toBe(true);
    expect(lowResCache.get(key)).toBe(dummyUrl);
    expect(lowResCache.size).toBe(1);
  });

  it("evicts least recently used thumbnail when exceeding maxSize", () => {
    const cache = new LowResCache(3);

    cache.set("key1", "url1");
    cache.set("key2", "url2");
    cache.set("key3", "url3");

    expect(cache.size).toBe(3);

    // Adding 4th item should evict key1
    cache.set("key4", "url4");

    expect(cache.size).toBe(3);
    expect(cache.has("key1")).toBe(false);
    expect(cache.get("key2")).toBe("url2");
    expect(cache.get("key3")).toBe("url3");
    expect(cache.get("key4")).toBe("url4");
  });

  it("updates LRU order on get access", () => {
    const cache = new LowResCache(3);

    cache.set("key1", "url1");
    cache.set("key2", "url2");
    cache.set("key3", "url3");

    // Access key1 to make it most recently used
    cache.get("key1");

    // Adding key4 should evict key2 (since key1 was refreshed)
    cache.set("key4", "url4");

    expect(cache.has("key2")).toBe(false);
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key3")).toBe(true);
    expect(cache.has("key4")).toBe(true);
  });

  it("clears cache completely", () => {
    lowResCache.set("k1", "u1");
    lowResCache.set("k2", "u2");
    expect(lowResCache.size).toBe(2);

    lowResCache.clear();

    expect(lowResCache.size).toBe(0);
    expect(lowResCache.has("k1")).toBe(false);
  });

  it("renders low-res thumbnail via doc.getPage and caches the result", async () => {
    // Mock HTMLCanvasElement context and toDataURL if missing in jsdom
    if (typeof HTMLCanvasElement !== "undefined") {
      HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        drawImage: vi.fn(),
      });
      HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue("data:image/png;base64,renderedThumb");
    }

    const renderPromiseMock = Promise.resolve();
    const renderFn = vi.fn().mockReturnValue({ promise: renderPromiseMock });
    const getViewportFn = vi.fn().mockReturnValue({ width: 200, height: 300 });

    const mockPage = {
      getViewport: getViewportFn,
      render: renderFn,
    };

    const mockDoc = {
      fingerprints: ["test-fingerprint"],
      getPage: vi.fn().mockResolvedValue(mockPage),
    } as unknown as PdfDocumentProxy;

    const dataUrl = await renderLowResThumbnail(mockDoc, 0, 0.35);

    expect(dataUrl).toBe("data:image/png;base64,renderedThumb");
    expect(mockDoc.getPage).toHaveBeenCalledWith(1); // 1-indexed
    expect(getViewportFn).toHaveBeenCalledWith({ scale: 0.35 });
    expect(renderFn).toHaveBeenCalled();

    // Verify subsequent call hits cache without calling doc.getPage again
    const cachedUrl = await renderLowResThumbnail(mockDoc, 0, 0.35);
    expect(cachedUrl).toBe("data:image/png;base64,renderedThumb");
    expect(mockDoc.getPage).toHaveBeenCalledTimes(1);
  });
});

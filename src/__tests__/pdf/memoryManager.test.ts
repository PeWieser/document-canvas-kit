import { describe, it, expect, beforeEach } from "vitest";
import { memoryManager } from "@/lib/pdf/memoryManager";

describe("memoryManager", () => {
  beforeEach(() => {
    memoryManager.triggerGC(true);
  });

  it("caches thumbnails and purges oldest when max limit is exceeded", () => {
    for (let i = 0; i < 30; i++) {
      memoryManager.setThumbnail(`thumb_${i}`, `data_url_${i}`);
    }

    const stats = memoryManager.getMemoryStats();
    expect(stats.cachedThumbnailCount).toBeLessThanOrEqual(24);
  });

  it("caches font ArrayBuffers and manages memory budget", () => {
    const dummyFont = new ArrayBuffer(1024);
    memoryManager.cacheFont("Arial", dummyFont);

    expect(memoryManager.getFont("Arial")).toBe(dummyFont);
    const stats = memoryManager.getMemoryStats();
    expect(stats.cachedFontCount).toBe(1);
  });

  it("clears memory on triggerGC", () => {
    memoryManager.setThumbnail("t1", "data1");
    memoryManager.cacheFont("f1", new ArrayBuffer(50));

    memoryManager.triggerGC(true);

    const stats = memoryManager.getMemoryStats();
    expect(stats.cachedThumbnailCount).toBe(0);
    expect(stats.cachedFontCount).toBe(0);
  });
});

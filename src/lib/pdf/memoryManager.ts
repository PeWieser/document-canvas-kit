import { globalCanvasPool } from "@/hooks/useCanvasPool";

export interface MemoryBudgetOptions {
  maxCachedThumbnails?: number;
  maxFontCacheEntries?: number;
  memoryLimitMB?: number;
}

export interface MemoryStats {
  estimatedCanvasMemoryMB: number;
  poolCanvasCount: number;
  cachedThumbnailCount: number;
  cachedFontCount: number;
}

class MemoryManager {
  private maxCachedThumbnails: number = 24;
  private maxFontCacheEntries: number = 30;
  private memoryLimitMB: number = 200;

  private thumbnailCache = new Map<string, string | HTMLCanvasElement>();
  private fontByteCache = new Map<string, ArrayBuffer>();

  constructor(options?: MemoryBudgetOptions) {
    if (options?.maxCachedThumbnails) this.maxCachedThumbnails = options.maxCachedThumbnails;
    if (options?.maxFontCacheEntries) this.maxFontCacheEntries = options.maxFontCacheEntries;
    if (options?.memoryLimitMB) this.memoryLimitMB = options.memoryLimitMB;
  }

  /**
   * Caches a rendered page thumbnail canvas/data URL up to maxCachedThumbnails.
   */
  setThumbnail(key: string, value: string | HTMLCanvasElement): void {
    if (this.thumbnailCache.has(key)) {
      this.thumbnailCache.delete(key);
    }
    this.thumbnailCache.set(key, value);

    if (this.thumbnailCache.size > this.maxCachedThumbnails) {
      const firstKey = this.thumbnailCache.keys().next().value;
      if (firstKey) {
        const item = this.thumbnailCache.get(firstKey);
        if (item && typeof item !== "string" && item instanceof HTMLCanvasElement) {
          item.width = 0;
          item.height = 0;
        }
        this.thumbnailCache.delete(firstKey);
      }
    }
  }

  getThumbnail(key: string): string | HTMLCanvasElement | undefined {
    return this.thumbnailCache.get(key);
  }

  /**
   * Caches font ArrayBuffer in memory with LRU eviction.
   */
  cacheFont(key: string, data: ArrayBuffer): void {
    if (this.fontByteCache.has(key)) {
      this.fontByteCache.delete(key);
    }
    this.fontByteCache.set(key, data);

    if (this.fontByteCache.size > this.maxFontCacheEntries) {
      const firstKey = this.fontByteCache.keys().next().value;
      if (firstKey) this.fontByteCache.delete(firstKey);
    }
  }

  getFont(key: string): ArrayBuffer | undefined {
    return this.fontByteCache.get(key);
  }

  /**
   * Returns stats about current memory allocation across canvas pool, thumbnails, and fonts.
   */
  getMemoryStats(): MemoryStats {
    const poolStats = globalCanvasPool.getPoolStats();
    // Rough estimate: standard high-DPI canvas ~ 14MB RGBA
    const estimatedCanvasMemoryMB = Number(((poolStats.inUse * 14000000) / (1024 * 1024)).toFixed(2));

    return {
      estimatedCanvasMemoryMB,
      poolCanvasCount: poolStats.total,
      cachedThumbnailCount: this.thumbnailCache.size,
      cachedFontCount: this.fontByteCache.size,
    };
  }

  /**
   * Triggers garbage collection across canvas pool, thumbnails, and font caches.
   */
  triggerGC(forceAll: boolean = false): void {
    globalCanvasPool.clear();

    if (forceAll) {
      for (const item of this.thumbnailCache.values()) {
        if (typeof item !== "string" && item instanceof HTMLCanvasElement) {
          item.width = 0;
          item.height = 0;
        }
      }
      this.thumbnailCache.clear();
      this.fontByteCache.clear();
    }

    if (typeof window !== "undefined" && (window as any).gc) {
      try {
        (window as any).gc();
      } catch {
        // ignore
      }
    }
  }
}

export const memoryManager = new MemoryManager();

import { useCallback, useRef } from "react";

export const CANVAS_POOL_SIZE = 6;

export interface PooledCanvas {
  element: HTMLCanvasElement;
  key: string | null;
  lastUsed: number;
  inUse: boolean;
}

export class CanvasPoolManager {
  private pool: PooledCanvas[] = [];
  private maxSize: number;

  constructor(maxSize: number = CANVAS_POOL_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Acquires a canvas element from the pool or creates a new one if limit not reached.
   * Reuses existing instances up to CANVAS_POOL_SIZE.
   */
  acquire(key: string, width: number, height: number): HTMLCanvasElement {
    const now = Date.now();

    // 1. Check if canvas with this key is already in pool
    let item = this.pool.find((p) => p.key === key);

    if (item) {
      item.inUse = true;
      item.lastUsed = now;
      if (item.element.width !== width || item.element.height !== height) {
        item.element.width = width;
        item.element.height = height;
      } else {
        const ctx = item.element.getContext("2d");
        ctx?.clearRect(0, 0, width, height);
      }
      return item.element;
    }

    // 2. Look for an available (not currently in-use) canvas in the pool
    item = this.pool
      .filter((p) => !p.inUse)
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];

    if (item) {
      item.key = key;
      item.inUse = true;
      item.lastUsed = now;
      item.element.width = width;
      item.element.height = height;
      return item.element;
    }

    // 3. If pool limit reached, evict LRU canvas
    if (this.pool.length >= this.maxSize) {
      const lruIndex = this.pool
        .map((p, idx) => ({ idx, lastUsed: p.lastUsed }))
        .sort((a, b) => a.lastUsed - b.lastUsed)[0].idx;

      const evicted = this.pool.splice(lruIndex, 1)[0];
      // Reset dimensions to free VRAM
      evicted.element.width = 0;
      evicted.element.height = 0;
    }

    // Create a new canvas instance
    const element =
      typeof document !== "undefined"
        ? document.createElement("canvas")
        : ({} as HTMLCanvasElement);

    if (element.setAttribute) {
      element.width = width;
      element.height = height;
    }

    const newItem: PooledCanvas = {
      element,
      key,
      lastUsed: now,
      inUse: true,
    };
    this.pool.push(newItem);
    return element;
  }

  /**
   * Releases a canvas back to the pool for reuse.
   */
  release(keyOrCanvas: string | HTMLCanvasElement): void {
    const item = this.pool.find(
      (p) => p.key === keyOrCanvas || p.element === keyOrCanvas
    );
    if (item) {
      item.inUse = false;
      item.lastUsed = Date.now();
    }
  }

  /**
   * Clears the canvas pool and resets backing store memory.
   */
  clear(): void {
    for (const item of this.pool) {
      if (item.element) {
        item.element.width = 0;
        item.element.height = 0;
      }
    }
    this.pool = [];
  }

  getPoolStats() {
    return {
      total: this.pool.length,
      inUse: this.pool.filter((p) => p.inUse).length,
      maxSize: this.maxSize,
    };
  }
}

export const globalCanvasPool = new CanvasPoolManager(CANVAS_POOL_SIZE);

export function useCanvasPool() {
  const poolRef = useRef<CanvasPoolManager>(globalCanvasPool);

  const acquireCanvas = useCallback(
    (key: string, width: number, height: number): HTMLCanvasElement => {
      return poolRef.current.acquire(key, width, height);
    },
    []
  );

  const releaseCanvas = useCallback((keyOrCanvas: string | HTMLCanvasElement) => {
    poolRef.current.release(keyOrCanvas);
  }, []);

  const clearPool = useCallback(() => {
    poolRef.current.clear();
  }, []);

  return {
    acquireCanvas,
    releaseCanvas,
    clearPool,
    getPoolStats: useCallback(() => poolRef.current.getPoolStats(), []),
  };
}

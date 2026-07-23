import { describe, it, expect, beforeEach } from "vitest";
import { CanvasPoolManager, CANVAS_POOL_SIZE, globalCanvasPool } from "@/hooks/useCanvasPool";

describe("CanvasPoolManager (LRU Canvas Pool)", () => {
  let pool: CanvasPoolManager;

  beforeEach(() => {
    pool = new CanvasPoolManager(CANVAS_POOL_SIZE);
  });

  it("acquires and reuses canvas elements up to CANVAS_POOL_SIZE = 6", () => {
    const c1 = pool.acquire("page_1", 100, 200);
    expect(c1).toBeDefined();
    expect(pool.getPoolStats().total).toBe(1);
    expect(pool.getPoolStats().inUse).toBe(1);

    // Re-acquire same key
    const c1Ref = pool.acquire("page_1", 100, 200);
    expect(c1Ref).toBe(c1);
    expect(pool.getPoolStats().total).toBe(1);

    pool.release("page_1");
    expect(pool.getPoolStats().inUse).toBe(0);

    // Acquire another key reuses released element
    const c2 = pool.acquire("page_2", 300, 400);
    expect(c2).toBe(c1);
    expect(pool.getPoolStats().total).toBe(1);
    expect(pool.getPoolStats().inUse).toBe(1);
  });

  it("evicts least recently used canvas when pool limit is exceeded", () => {
    // Fill pool to CANVAS_POOL_SIZE (6)
    for (let i = 0; i < 6; i++) {
      pool.acquire(`key_${i}`, 100, 100);
    }
    expect(pool.getPoolStats().total).toBe(6);

    // Acquire 7th item triggers LRU eviction
    pool.acquire("key_6", 200, 200);
    expect(pool.getPoolStats().total).toBe(6);
  });

  it("clears all canvas elements on clear()", () => {
    pool.acquire("k1", 100, 100);
    pool.acquire("k2", 100, 100);
    expect(pool.getPoolStats().total).toBe(2);

    pool.clear();
    expect(pool.getPoolStats().total).toBe(0);
  });
});

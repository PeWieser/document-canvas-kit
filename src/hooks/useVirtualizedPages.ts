import { useState, useEffect, useMemo } from "react";

export interface VirtualPageItem {
  index: number;
  top: number;
  height: number;
}

export interface UseVirtualizedPagesOptions {
  totalCount: number;
  getPageHeight: (index: number) => number;
  containerRef: React.RefObject<HTMLElement | null>;
  gap?: number;
  overscan?: number;
}

export interface VirtualizedPagesResult {
  visibleRange: { startIndex: number; endIndex: number };
  virtualItems: VirtualPageItem[];
  totalHeight: number;
  offsets: number[];
}

/**
 * Hook for calculating virtualized page index ranges and cumulative Y offsets.
 * Preserves scroll performance for multi-page PDF documents.
 */
export function useVirtualizedPages({
  totalCount,
  getPageHeight,
  containerRef,
  gap = 24,
  overscan = 2,
}: UseVirtualizedPagesOptions): VirtualizedPagesResult {
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [viewportHeight, setViewportHeight] = useState<number>(800);

  // Compute cumulative offsets and total height for all pages
  const { offsets, heights, totalHeight } = useMemo(() => {
    const offsets: number[] = new Array(totalCount);
    const heights: number[] = new Array(totalCount);
    let currentY = 0;

    for (let i = 0; i < totalCount; i++) {
      offsets[i] = currentY;
      const h = getPageHeight(i);
      heights[i] = h;
      currentY += h + (i < totalCount - 1 ? gap : 0);
    }

    return { offsets, heights, totalHeight: currentY };
  }, [totalCount, getPageHeight, gap]);

  // Handle scroll and container resize events with rAF throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rAF = 0;
    const handleScroll = () => {
      cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        setScrollTop(container.scrollTop);
        setViewportHeight(container.clientHeight);
      });
    };

    setScrollTop(container.scrollTop);
    setViewportHeight(container.clientHeight || 800);

    container.addEventListener("scroll", handleScroll, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        setViewportHeight(container.clientHeight);
      });
      ro.observe(container);
    }

    return () => {
      cancelAnimationFrame(rAF);
      container.removeEventListener("scroll", handleScroll);
      if (ro) ro.disconnect();
    };
  }, [containerRef]);

  // Calculate visible page range with overscan buffer
  const { visibleRange, virtualItems } = useMemo(() => {
    if (totalCount === 0) {
      return { visibleRange: { startIndex: 0, endIndex: 0 }, virtualItems: [] };
    }

    const viewTop = scrollTop;
    const viewBottom = scrollTop + viewportHeight;

    let start = 0;
    let end = totalCount - 1;

    // Find first page whose bottom edge is at or below viewTop
    for (let i = 0; i < totalCount; i++) {
      if (offsets[i] + heights[i] >= viewTop) {
        start = i;
        break;
      }
    }

    // Find last page whose top edge is at or above viewBottom
    for (let i = start; i < totalCount; i++) {
      if (offsets[i] <= viewBottom) {
        end = i;
      } else {
        break;
      }
    }

    // Apply overscan buffer
    const startIndex = Math.max(0, start - overscan);
    const endIndex = Math.min(totalCount - 1, end + overscan);

    const items: VirtualPageItem[] = [];
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        top: offsets[i],
        height: heights[i],
      });
    }

    return {
      visibleRange: { startIndex, endIndex },
      virtualItems: items,
    };
  }, [totalCount, offsets, heights, scrollTop, viewportHeight, overscan]);

  return {
    visibleRange,
    virtualItems,
    totalHeight,
    offsets,
  };
}

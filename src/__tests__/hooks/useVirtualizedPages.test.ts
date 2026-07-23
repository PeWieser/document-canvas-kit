import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizedPages } from "../../hooks/useVirtualizedPages";

function TestContainer({ onResult }: { onResult: (res: any) => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const result = useVirtualizedPages({
    totalCount: 10,
    getPageHeight: () => 1000,
    containerRef,
    gap: 20,
    overscan: 1,
  });

  React.useEffect(() => {
    onResult(result);
  }, [result, onResult]);

  return React.createElement("div", { ref: containerRef, style: { height: "800px", overflow: "auto" } });
}

describe("useVirtualizedPages hook", () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
      root = null;
    }
    if (container) {
      document.body.removeChild(container);
      container = null;
    }
  });

  it("calculates total height and offsets accurately", () => {
    let captured: any = null;
    act(() => {
      root = createRoot(container!);
      root.render(React.createElement(TestContainer, { onResult: (res: any) => (captured = res) }));
    });

    expect(captured).not.toBeNull();
    expect(captured.totalHeight).toBe(10 * 1000 + 9 * 20); // 10180
    expect(captured.offsets.length).toBe(10);
    expect(captured.offsets[0]).toBe(0);
    expect(captured.offsets[1]).toBe(1020);
    expect(captured.offsets[2]).toBe(2040);
  });
});

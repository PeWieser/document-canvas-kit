import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VectorOverlay } from "../../components/editor/VectorOverlay";
import { SelectionManager } from "../../components/editor/SelectionManager";
import { SnapGuides, computeSnapGuides } from "../../components/editor/SnapGuides";
import { PropertiesPanel } from "../../components/editor/PropertiesPanel";
import { VectorElement } from "../../lib/pdf/types";

describe("Phase D: Vector UI Components", () => {
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

  const dummyElement: VectorElement = {
    id: "vec-1-1",
    page: 1,
    bounds: { minX: 50, minY: 100, maxX: 200, maxY: 300 },
    segments: [
      { op: "m", points: [{ x: 50, y: 100 }] },
      { op: "l", points: [{ x: 200, y: 300 }] },
    ],
    strokeColor: "#3b82f6",
    strokeWidth: 2,
  };

  it("renders VectorOverlay SVG element and path", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <VectorOverlay
          elements={[dummyElement]}
          selectedIds={["vec-1-1"]}
          pageWidth={612}
          pageHeight={792}
        />
      );
    });

    const overlay = container?.querySelector('[data-testid="vector-overlay"]');
    expect(overlay).not.toBeNull();
    expect(container?.innerHTML).toContain("path");
  });

  it("renders SelectionManager with 8 resize handles and 1 rotation handle", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <SelectionManager
          selectedElements={[dummyElement]}
          pageWidth={612}
          pageHeight={792}
        />
      );
    });

    const selectionManager = container?.querySelector('[data-testid="selection-manager"]');
    expect(selectionManager).not.toBeNull();

    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w", "rotation"];
    handles.forEach((pos) => {
      expect(container?.querySelector(`[data-testid="handle-${pos}"]`)).not.toBeNull();
    });
  });

  it("renders SnapGuides and computes page center snapping", () => {
    const activeBounds = { minX: 254, minY: 300, maxX: 354, maxY: 400 }; // Center X is 304, close to 612/2=306
    const { snappedBounds, guides } = computeSnapGuides(activeBounds, [], 612, 792, 10);

    expect(guides.length).toBeGreaterThan(0);
    expect(snappedBounds.minX + (snappedBounds.maxX - snappedBounds.minX) / 2).toBe(306);

    act(() => {
      root = createRoot(container!);
      root.render(
        <SnapGuides guides={guides} pageWidth={612} pageHeight={792} />
      );
    });

    const snapGuides = container?.querySelector('[data-testid="snap-guides"]');
    expect(snapGuides).not.toBeNull();
  });

  it("renders PropertiesPanel with position and color controls", () => {
    let updatedKey = "";
    let updatedVal: any = null;

    act(() => {
      root = createRoot(container!);
      root.render(
        <PropertiesPanel
          selectedElement={dummyElement}
          onUpdateProperty={(key, value) => {
            updatedKey = key;
            updatedVal = value;
          }}
        />
      );
    });

    const panel = container?.querySelector('[data-testid="properties-panel"]');
    expect(panel).not.toBeNull();
    expect(container?.innerHTML).toContain("Vector Inspector");
    expect(container?.innerHTML).toContain("X Position");
    expect(container?.innerHTML).toContain("Stroke Color");
  });
});

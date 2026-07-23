import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ShortcutsPanel } from "../../components/editor/ShortcutsPanel";

describe("ShortcutsPanel Component", () => {
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

  it("renders shortcuts panel overlay when isOpen is true", () => {
    act(() => {
      root = createRoot(container!);
      root.render(<ShortcutsPanel isOpen={true} onClose={vi.fn()} />);
    });

    expect(container?.innerHTML).toContain("PDF Studio Shortcuts");
    expect(container?.innerHTML).toContain("Save Document");
    expect(container?.innerHTML).toContain("Redact Tool");
  });

  it("does not render when isOpen is false", () => {
    act(() => {
      root = createRoot(container!);
      root.render(<ShortcutsPanel isOpen={false} onClose={vi.fn()} />);
    });

    expect(container?.innerHTML).toBe("");
  });

  it("filters shortcuts by search query", () => {
    act(() => {
      root = createRoot(container!);
      root.render(<ShortcutsPanel isOpen={true} onClose={vi.fn()} />);
    });

    const input = container?.querySelector("input");
    expect(input).not.toBeNull();

    act(() => {
      if (input) {
        input.value = "Redact";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    expect(container?.innerHTML).toContain("Redact Tool");
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PdfStudio } from "../../components/editor/PdfStudio";
import { useEditor } from "../../store/editorStore";
import { I18nProvider } from "../../lib/i18n";

// Mock pdfjs-dist and other heavy dependencies
vi.mock("../../lib/pdf/pdfjs", () => ({
  loadPdfDocument: vi.fn().mockResolvedValue({
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
      getTextContent: vi.fn().mockResolvedValue({ items: [] }),
    }),
  }),
  getPageTextItems: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../hooks/useLoadedPdf", () => ({
  useLoadedPdf: vi.fn().mockReturnValue({
    doc: {
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 600, height: 800 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({ items: [] }),
        commonObjs: {
          get: vi.fn(),
        },
      }),
    },
    error: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn().mockReturnValue("tid"),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock HTMLCanvasElement.prototype.getContext for happy-dom
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(),
  putImageData: vi.fn(),
  createImageData: vi.fn(),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
});

describe("UI Interaction and Keybindings", () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    // Load a mock document in the store so PDFStudio renders the editor view (not the DropZone)
    act(() => {
      useEditor.getState().loadDoc("mock.pdf", new Uint8Array([1, 2, 3]), 1, { w: 600, h: 800 });
    });
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
    // Clean up key listeners
    const s = useEditor.getState();
    act(() => {
      s.closeDoc();
    });
  });

  it("checks sidebar defaults to closed (false)", () => {
    expect(useEditor.getState().sidebarOpen).toBe(false);
  });

  it("renders PdfStudio and handles keydown tool mapping shortcuts", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <PdfStudio />
        </I18nProvider>,
      );
    });

    // Simulate keydown event 'h' on window
    const eventH = new KeyboardEvent("keydown", { key: "h", bubbles: true });
    act(() => {
      window.dispatchEvent(eventH);
    });
    expect(useEditor.getState().tool).toBe("highlight");

    // Simulate keydown event 'p'
    const eventP = new KeyboardEvent("keydown", { key: "p", bubbles: true });
    act(() => {
      window.dispatchEvent(eventP);
    });
    expect(useEditor.getState().tool).toBe("pen");

    // Simulate keydown event 'v'
    const eventV = new KeyboardEvent("keydown", { key: "v", bubbles: true });
    act(() => {
      window.dispatchEvent(eventV);
    });
    expect(useEditor.getState().tool).toBe("select");

    // Simulate keydown event 't' (edit-text)
    const eventT = new KeyboardEvent("keydown", { key: "t", bubbles: true });
    act(() => {
      window.dispatchEvent(eventT);
    });
    expect(useEditor.getState().tool).toBe("edit-text");

    // Simulate keydown event 'x' (textbox)
    const eventX = new KeyboardEvent("keydown", { key: "x", bubbles: true });
    act(() => {
      window.dispatchEvent(eventX);
    });
    expect(useEditor.getState().tool).toBe("textbox");
  });

  it("simulates rapid tool and sidebar switching (stress/stuttering test)", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <PdfStudio />
        </I18nProvider>,
      );
    });

    const start = performance.now();

    // Toggle sidebar and switch tools rapidly (50 iterations)
    for (let i = 0; i < 50; i++) {
      act(() => {
        useEditor.getState().toggleSidebar();
        useEditor.getState().setTool(i % 2 === 0 ? "highlight" : "select");
      });
    }

    const duration = performance.now() - start;
    console.log(`Rapid 50x state transitions took: ${duration.toFixed(2)}ms`);

    // Ensure 50 rapid changes take less than 2000ms in testing environment (safety margin)
    expect(duration).toBeLessThan(2000);
  });
});

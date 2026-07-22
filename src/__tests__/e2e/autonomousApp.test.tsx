import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PdfStudio } from "../../components/editor/PdfStudio";
import { useEditor } from "../../store/editorStore";
import { I18nProvider } from "../../lib/i18n";

// Mock pdfjs-dist
vi.mock("../../lib/pdf/pdfjs", () => ({
  loadPdfDocument: vi.fn().mockResolvedValue({
    numPages: 2,
    getPage: vi.fn().mockResolvedValue({
      getViewport: vi.fn().mockReturnValue({ width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0] }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          { str: "Hello PDF World", transform: [12, 0, 0, 12, 50, 700], width: 120, height: 12, fontName: "g_font_1" },
          { str: "Second Line Text", transform: [14, 0, 0, 14, 50, 650], width: 140, height: 14, fontName: "g_font_2" },
        ],
      }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    }),
  }),
  getPageTextItems: vi.fn().mockResolvedValue([
    { str: "Hello PDF World", transform: [12, 0, 0, 12, 50, 700], width: 120, height: 12, fontName: "g_font_1" },
    { str: "Second Line Text", transform: [14, 0, 0, 14, 50, 650], width: 140, height: 14, fontName: "g_font_2" },
  ]),
}));

vi.mock("../../hooks/useLoadedPdf", () => ({
  useLoadedPdf: vi.fn().mockReturnValue({
    doc: {
      numPages: 2,
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi.fn().mockReturnValue({ width: 600, height: 800, transform: [1, 0, 0, 1, 0, 0] }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            { str: "Hello PDF World", transform: [12, 0, 0, 12, 50, 700], width: 120, height: 12, fontName: "g_font_1" },
            { str: "Second Line Text", transform: [14, 0, 0, 14, 50, 650], width: 140, height: 14, fontName: "g_font_2" },
          ],
        }),
        commonObjs: { get: vi.fn() },
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
    info: vi.fn(),
  },
}));

// Canvas context mock
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
  measureText: vi.fn().mockReturnValue({ width: 120 }),
});

describe("Autonomous Functional & E2E Test Suite", () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);

    act(() => {
      useEditor.getState().loadDoc("test_document.pdf", new Uint8Array([1, 2, 3, 4]), 2, { w: 600, h: 800 });
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
    act(() => {
      useEditor.getState().closeDoc();
    });
  });

  it("1. Verifies document load and initial state", () => {
    const s = useEditor.getState();
    expect(s.fileName).toBe("test_document.pdf");
    expect(s.numPages).toBe(2);
    expect(s.zoom).toBe(1.15);
    expect(s.tool).toBe("select");
  });

  it("2. Verifies full tool switching cycle", () => {
    const s = useEditor.getState();
    const tools = ["select", "hand", "pen", "highlight", "redact", "textReplace", "textbox", "comment"] as const;

    for (const t of tools) {
      act(() => {
        s.setTool(t as any);
      });
      expect(useEditor.getState().tool).toBe(t);
    }
  });

  it("3. Verifies annotation management (add, update, delete, undo, redo)", () => {
    const store = useEditor.getState();

    // Add Textbox
    act(() => {
      store.addAnnotation({
        id: "tb-1",
        kind: "textbox",
        page: 0,
        x: 100,
        y: 200,
        w: 150,
        h: 30,
        text: "Custom Textbox",
        fontSize: 14,
        color: "#000000",
        fontFamily: "Helvetica",
        bold: false,
        italic: false,
      });
    });

    expect(useEditor.getState().annotations.length).toBe(1);
    expect(useEditor.getState().annotations[0].text).toBe("Custom Textbox");

    // Update Textbox
    act(() => {
      store.updateAnnotation("tb-1", { text: "Updated Content", x: 120 }, true);
    });

    expect(useEditor.getState().annotations[0].text).toBe("Updated Content");
    expect((useEditor.getState().annotations[0] as any).x).toBe(120);

    // Undo
    act(() => {
      store.undo();
    });
    expect(useEditor.getState().annotations[0].text).toBe("Custom Textbox");

    // Redo
    act(() => {
      store.redo();
    });
    expect(useEditor.getState().annotations[0].text).toBe("Updated Content");

    // Remove
    act(() => {
      store.removeAnnotation("tb-1");
    });
    expect(useEditor.getState().annotations.length).toBe(0);
  });

  it("4. Verifies textReplace transform updates preserve matrix without explosion", () => {
    const store = useEditor.getState();

    act(() => {
      store.addAnnotation({
        id: "tr-1",
        kind: "textReplace",
        page: 0,
        rect: { x: 50, y: 700, w: 120, h: 12 },
        text: "Hello PDF World",
        fontSize: 12,
        color: "#111111",
        fontFamily: "Arial",
        bold: false,
        italic: false,
        transform: [12, 0, 0, 12, 50, 700],
        width: 120,
      });
    });

    const initialAnno = useEditor.getState().annotations[0] as any;
    expect(initialAnno.transform).toEqual([12, 0, 0, 12, 50, 700]);

    // Simulate drag movement (+10pt right, +5pt up in PDF space)
    act(() => {
      const origT = initialAnno.transform;
      const newT = [...origT];
      newT[4] = origT[4] + 10;
      newT[5] = origT[5] + 5;
      store.updateAnnotation("tr-1", { transform: newT }, false);
    });

    const updatedAnno = useEditor.getState().annotations[0] as any;
    expect(updatedAnno.transform[4]).toBe(60);
    expect(updatedAnno.transform[5]).toBe(705);
    // Ensure font scale matrix coefficients [12, 0, 0, 12] remain unchanged
    expect(updatedAnno.transform.slice(0, 4)).toEqual([12, 0, 0, 12]);
  });

  it("5. Verifies UI component rendering in PdfStudio container", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <PdfStudio />
        </I18nProvider>,
      );
    });

    // Verify container rendered without crashing
    expect(container?.innerHTML).toContain("pdf-text-layer");
  });
});

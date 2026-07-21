import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { PageView } from "../../components/editor/PageView";
import { useEditor } from "../../store/editorStore";
import { I18nProvider } from "../../lib/i18n";

// Mock the core dependencies
vi.mock("../../lib/pdf/pdfjs", () => ({
  loadPdfDocument: vi.fn(),
  pdfjsLib: {
    Util: {
      transform: vi.fn().mockReturnValue([1, 0, 0, 1, 0, 0]),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn().mockReturnValue("tid"),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock HTMLCanvasElement.prototype.getContext
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

describe("Font Integration in UI", () => {
  let container: HTMLDivElement | null = null;
  let root: any = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(""),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    }) as any;
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
    useEditor.getState().closeDoc();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("sets default font family when detecting font from text replace", async () => {
    const s = useEditor.getState();
    act(() => {
      s.setDefaultFontFamily("");
      s.setTool("edit-text");
    });

    const mockDoc = {
      getPage: vi.fn().mockResolvedValue({
        getViewport: vi
          .fn()
          .mockReturnValue({
            width: 600,
            height: 800,
            transform: [1, 0, 0, 1, 0, 0],
            convertToPdfPoint: vi.fn().mockReturnValue([0, 0]),
            convertToViewportPoint: vi.fn().mockReturnValue([0, 0]),
          }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
        getTextContent: vi.fn().mockResolvedValue({
          items: [
            {
              str: "Hello",
              transform: [12, 0, 0, 12, 10, 10],
              width: 50,
              height: 12,
              fontName: "g1",
            },
          ],
        }),
        commonObjs: {
          get: vi.fn().mockReturnValue({ name: "ABCDEF+Arial-BoldMT" }),
        },
      }),
    };

    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <PageView doc={mockDoc as any} pageId={0} />
        </I18nProvider>,
      );
    });

    // Wait for async effects (render, getTextContent)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // The text layer should have rendered our "Hello" item
    // It is rendered as a span with data-i="0"
    const span = container!.querySelector('span[data-i="0"]') as HTMLSpanElement;
    expect(span).not.toBeNull();

    // Click it to trigger replaceSpan
    act(() => {
      span.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Wait for async font matching and resolution
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // It should have resolved "Arial" and set it as default
    expect(useEditor.getState().defaultFontFamily).toBe("Arial");

    // Check that a new annotation was added
    const annos = useEditor.getState().annotations;
    expect(annos.length).toBe(1);
    expect(annos[0].kind).toBe("textReplace");
    expect((annos[0] as any).fontFamily).toBe("Arial");
    expect((annos[0] as any).bold).toBe(true);
  });
});

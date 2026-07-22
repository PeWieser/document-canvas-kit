import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { FeedbackWidget } from "../../components/editor/FeedbackWidget";
import { I18nProvider } from "../../lib/i18n";

vi.mock("sonner", () => ({
  toast: {
    loading: vi.fn().mockReturnValue("tid"),
    dismiss: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("FeedbackWidget Component", () => {
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

  it("renders floating feedback button", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <FeedbackWidget />
        </I18nProvider>
      );
    });

    expect(container?.innerHTML).toContain("Feedback");
  });

  it("opens feedback dialog on click", () => {
    act(() => {
      root = createRoot(container!);
      root.render(
        <I18nProvider>
          <FeedbackWidget />
        </I18nProvider>
      );
    });

    const button = container?.querySelector("button");
    expect(button).not.toBeNull();

    act(() => {
      button?.click();
    });

    expect(document.body.innerHTML).toContain("Feedback &amp; Vorschläge");
  });
});

# UI Research & React Performance Optimization Report: PDF Editor

This report details color palette recommendations, UI layout strategies, and React performance optimization guidelines tailored for a professional PDF editor app. It covers design aesthetics inspired by Notion, Apple, and Swiss design principles, alongside technical solutions for achieving stutter-free interactions (60 FPS) when toggling panels, resizing, or zooming in React.

---

## 1. Palette Recommendations (HEX Values)

A PDF editor requires a visual design that does not compete with the document content. The canvas background must be neutral, while controls and panels should remain subtle, high-contrast, and functional.

### Notion Style (Warm Neutral Minimalism)

Notion relies on low-contrast, warm grays and off-blacks, prioritizing whitespace over borders.

- **Main Background (Canvas Desk):** `#F7F7F5` (Warm off-white)
- **Panel/Sidebar Background:** `#F7F7F5`
- **Borders/Dividers:** `#E9E9E7` (Soft warm gray)
- **Text Primary:** `#37352F` (Deep carbon grey)
- **Text Muted:** `#7C7B77`
- **Hover/Active States:** `#F1F1EF` (Soft secondary gray)

### Apple Style (Sleek Pro Interface & System Vibrancy)

Apple uses crisp, high-contrast monochrome tones paired with vibrant primary accent colors and rounded corners.

- **Light Background (Desk):** `#F5F5F7` (Athens gray)
- **Light Panel/Sidebar:** `#FFFFFF`
- **Dark Background (Desk):** `#0F0F0F` or `#1E1E1E` (Pure dark mode)
- **Dark Panel/Sidebar:** `#1C1C1E` / `#2C2C2E`
- **Accent Color (Interactive):** `#007AFF` (Apple Blue) or `#0066CC`
- **Warning/Destructive:** `#FF3B30` (System Red)
- **Borders/Dividers:** `#D1D1D6` (Light mode) / `#38383A` (Dark mode)

### Swiss Design (Asymmetric Grid & High-Contrast Accents)

The International Typographic (Swiss) style relies on a rigid grid, strong type scaling, neutral backgrounds, and a single intense primary color (usually red) for emphasis.

- **Primary Accent:** `#E63946` (Swiss Red)
- **Base Charcoal:** `#1A1A1A` (Heavy dark gray for strong typography)
- **Neutral Gray Base:** `#F2F2F2` (Clean, cold light gray)
- **Grid Lines:** `#CCCCCC` or `#E2E2E2`

### Unified Recommendation for PDF Studio

To combine these aesthetics, we map these styles to a responsive light/dark theme matching the existing Tailwind CSS configuration:

| CSS Variable         | Light Mode (Notion/Apple) | Dark Mode (Apple Pro) | Purpose                                   |
| :------------------- | :------------------------ | :-------------------- | :---------------------------------------- |
| `--background`       | `#FFFFFF`                 | `#191919`             | Main sheet/panel backgrounds              |
| `--desk`             | `#F7F7F5`                 | `#0F0F0F`             | Backdrop canvas area behind the PDF pages |
| `--sidebar`          | `#F7F7F5`                 | `#202020`             | Rails and panels                          |
| `--primary`          | `#007AFF`                 | `#2F80ED`             | Primary interactive elements, selections  |
| `--destructive`      | `#DF5B5B`                 | `#E25C5C`             | Deletion and destructive highlights       |
| `--border`           | `#E9E9E7`                 | `#2A2A2A`             | Clean, subtle separation grid lines       |
| `--foreground`       | `#37352F`                 | `#E3E3E3`             | Main readable text                        |
| `--muted-foreground` | `#7C7B77`                 | `#8D8D8D`             | Secondary text, shortcut indicators       |

---

## 2. UI Layout Recommendations

To ensure an intuitive and clutter-free user experience, we recommend a structural layout centered around **information density** and **contextual awareness**:

```
┌────────────────────────────────────────────────────────────────────────┐
│  Toolbar (Global & Tool Settings: Zoom, Export, Core Tools)            │
├──────────────┬──────────────────────────────────────────┬──────────────┤
│              │                                          │              │
│  Left Rail   │  Center Canvas Desk                      │  Right Panel │
│  (Thumbnails)│                                          │  (Comments   │
│              │  ┌─────────────────────────────────┐     │   & Annot.)  │
│  - Reorder   │  │                                 │     │              │
│  - Delete    │  │        Active PDF Page          │     │  - Threaded  │
│  - Compact   │  │        (Floating Toolbar overlay│     │    Replies   │
│              │  │         for text/draw styles)   │     │  - Status    │
│              │  │                                 │     │    Badges    │
│              │  └─────────────────────────────────┘     │              │
│              │                                          │              │
└──────────────┴──────────────────────────────────────────┴──────────────┘
```

1.  **Top-Bar / Toolbar (Global Controls):**
    - Keep it single-row (max 48px height) to maximize vertical canvas space.
    - Show primary tools (Select, Highlight, Redact, Pen, Comment) with clear keyboard shortcuts (e.g., `V`, `H`, `R`, `P`, `C`).
    - Integrate a **Contextual Action Bar** below or within the Toolbar that appears _only_ when a tool or annotation is selected (e.g., show the `FontPicker` only when a text annotation is active).
2.  **Left Rail (Thumbnail Explorer):**
    - Width should be constrained (140px) to keep focus on the main document.
    - Support smooth drag-and-drop page reordering.
    - Show small badge indices (`1`, `2`, `3`) below thumbnails.
3.  **Right Panel (Comments & Metadata):**
    - Keep it collapsible and resizable (minimum width 250px, max 400px).
    - Group comments by page, indicating status with colored badges (e.g., green for resolved, grey for open).
4.  **Floating Mini-Toolbar (Apple/Swiss-inspired):**
    - When selecting text on the page, display a compact popup toolbar immediately above the cursor for quick action triggers (e.g., "Highlight", "Redact", "Copy").

---

## 3. React Performance Optimization Tips (Avoiding UI Lag)

A major cause of UI stuttering during zoom or panel resizing in React PDF viewers is **layout thrashing** and **repeated high-DPI canvas redrawing**. Below are actionable techniques to keep interactions fluid.

### 3.1. Decoupling Resizing from Canvas Redrawing (`react-resizable-panels`)

By default, dragging a panel resize handler updates state continuously, triggering parent re-renders and forcing PDF.js to redraw the canvas multiple times per second.

**Solution:** Separate visual resizing (CSS-driven) from JavaScript state updates (expensive).

1.  **Let CSS handle the active resize:** Ensure the canvas containers use fluid CSS widths (`width: 100%`, `height: 100%`) or flexboxes. The browser handles DOM element scaling extremely quickly.
2.  **Delay Canvas Redrawing:** Update the React/Zustand state that triggers the canvas redraw only _after_ the resize has finished, or throttle the updates.

```typescript
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import debounce from "lodash/debounce";

export function EditorLayout() {
  const setContainerSize = useEditor((s) => s.setContainerSize);

  // Debounce the size update so we don't redraw the PDF on every pixel changed
  const debouncedResize = useCallback(
    debounce((width: number, height: number) => {
      setContainerSize({ w: width, h: height });
    }, 150),
    []
  );

  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={20} minSize={15}>
        <ThumbnailRail />
      </Panel>
      <PanelResizeHandle className="w-1 bg-border cursor-col-resize hover:bg-primary/50 transition-colors" />
      <Panel
        defaultSize={80}
        // Capture size changes, but debounce the expensive recalculations
        onResize={(size) => {
          // Translate percentage size to pixels based on parent, then debounce:
          const parentWidth = window.innerWidth * (size / 100);
          debouncedResize(parentWidth, window.innerHeight);
        }}
      >
        <main className="w-full h-full overflow-auto">
          <CanvasDesk />
        </main>
      </Panel>
    </PanelGroup>
  );
}
```

### 3.2. Smooth Zooming with CSS Scale Transforms

Redrawing a PDF page via PDF.js on every scroll wheel notch or pinch gesture causes rendering stuttering.

**Solution: The Hybrid Zoom Pattern**

1.  **Interactive Phase (CSS):** During zoom gestures, apply a GPU-accelerated CSS `transform: scale(zoomFactor)` on the page wrapper. This scales the existing low-resolution bitmap smoothly.
2.  **Settling Phase (Redraw):** Debounce the PDF.js canvas redraw by 150-250ms. When the user stops zooming, redraw the canvas once at the final, sharp target scale and reset the CSS transform to `scale(1)`.

```typescript
// Inside PageView component
const pageRef = useRef<HTMLDivElement>(null);
const zoom = useEditor((s) => s.zoom);
const [renderedZoom, setRenderedZoom] = useState(zoom);

// Debounce the actual rendering of the high-res canvas
useEffect(() => {
  const handler = setTimeout(() => {
    setRenderedZoom(zoom);
  }, 200);
  return () => clearTimeout(handler);
}, [zoom]);

// Calculate current scale factor for visual scaling
const scaleFactor = zoom / renderedZoom;

return (
  <div
    ref={pageRef}
    className="origin-top-left transition-transform duration-75 ease-out"
    style={{
      transform: `scale(${scaleFactor})`,
      willChange: "transform"
    }}
  >
    {/* Canvas rendered at the older 'renderedZoom' scale, scaled smoothly via CSS */}
    <CanvasRenderer zoom={renderedZoom} />
  </div>
);
```

### 3.3. Prevent Re-renders using Zustand Selectors & React.memo

Avoid rendering a parent container when only a localized action happens (like typing in a text field or clicking a comment pin).

- **Fine-grained Zustand Subscriptions:** Instead of pulling the entire store object, select only what is needed:
  ```typescript
  // Bad: Re-renders when ANY property in the store changes
  const store = useEditor();

  // Good: Re-renders ONLY when the current page index changes
  const currentPage = useEditor((s) => s.currentPage);
  ```
- **Component Memoization:** Wrap heavy child elements like `<PageView />` or `<PageThumb />` in `React.memo` to ensure they only re-render if their explicit props (e.g. `pageId`) change:
  ```typescript
  export const PageView = React.memo(function PageView({ doc, pageId }) {
    // Render logic
  });
  ```

### 3.4. Buffer Virtualization (Intersection Observer)

If a PDF has dozens of pages, mounting all page DOM nodes will cause memory bloat and layout stutters.

- **Buffer Pages:** The current implementation uses an `IntersectionObserver` to check visibility. To prevent white flashing during scroll, apply a `rootMargin: "800px 0px"` (loads pages slightly before they scroll into view).
- **Dynamic Unmounting:** Keep only visible pages and 1 page before/after mounted. Unmount canvas buffers for pages that are far away from the viewport to free up browser memory.

---

## 4. Testing Best Practices for UI Lag & Responsiveness

To prevent regressions and identify lag before it reaches production, integrate performance checks into your development and testing workflows.

### 4.1. Automated Performance Timing Assertions in Playwright

You can write Playwright E2E tests to measure interaction budgets. For example, ensure toggling a panel or changing a view is completed within a frame-rate budget (e.g., `< 16.7ms` for 60 FPS, or `< 50ms` to avoid perceivable human lag).

```typescript
import { test, expect } from "@playwright/test";

test("Panel toggle should be fast and responsive", async ({ page }) => {
  await page.goto("/editor");
  await page.waitForSelector("[data-testid='pdf-page-0']");

  // Measure start time
  const startTime = await page.evaluate(() => performance.now());

  // Trigger the panel toggle
  await page.click("[data-testid='toggle-comments-btn']");

  // Wait for the panel to transition and become visible
  await page.waitForSelector("[data-testid='comments-panel']", { state: "attached" });

  const endTime = await page.evaluate(() => performance.now());
  const duration = endTime - startTime;

  console.log(`Comments Panel Toggle took: ${duration.toFixed(2)}ms`);

  // Enforce a performance budget (e.g., must render/stabilize within 50ms)
  expect(duration).toBeLessThan(50);
});
```

### 4.2. Vitest Performance Mocking

Because Vitest runs in simulated environments (like `happy-dom` or `jsdom`), rendering canvases will fail or run extremely slowly.

- **Mock heavy rendering:** In unit tests (e.g., `editorStore.test.ts`), mock PDF.js and Canvas functions completely so they do not execute slow pixel drawing algorithms.
- **Mock Canvas APIs:**
  ```typescript
  // setupFiles.ts or inside the test file
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(),
    putImageData: vi.fn(),
    createImageData: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  });
  ```

### 4.3. Manual Debugging Pipeline

1.  **React Scan / Why-Did-You-Render (WDYR):** Run these in development to highlight components flashing red (meaning unnecessary re-renders).
2.  **React DevTools Profiler:** Record the "toggle panel" interaction. Check if sibling pages or thumbnails are re-rendering. If they are, add `React.memo` or refine the Zustand selectors.
3.  **Chrome Performance Profiling:** Record layout changes under **6x CPU Throttling**. If you see long amber bars labeled "Layout" or "Recalculate Style" during resizes, it indicates CSS reflow issues. Add CSS property `contain: strict;` or `contain: content;` to the page wrappers to isolate paint zones.

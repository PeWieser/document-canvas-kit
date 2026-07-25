# Project Documentation - PDF Studio (Web-First Document Canvas)

This documentation serves as a comprehensive guide and onboarding manual for developers and AI agents joining the project. It details the architecture, module dependencies, and exact technical implementations of the PDF Studio application.

---

## 1. Core Stack & Infrastructure

The project is built around a modern, performant React stack designed for edge deployments.

> **CRITICAL RESTRICTION**:
> The build and deployment infrastructure is strictly managed by **Lovable** and targets **Cloudflare** via Nitro.
> Do **NOT** modify the following files unless specifically requested:
>
> - `vite.config.ts` (Uses `@lovable.dev/vite-tanstack-config` which injects SSR/Nitro plugins)
> - `src/server.ts` & `src/start.ts` (SSR / Edge Worker entry points)
> - `src/router.tsx` & `src/routeTree.gen.ts` (TanStack Router configuration)
> - `.lovable/` & `.wrangler/` (Configuration for Lovable and Cloudflare)

### Dependencies

- **Framework**: React 19 + TanStack Start (SSR)
- **Routing**: `@tanstack/react-router`
- **State Management**: Zustand v5 (`src/store/editorStore.ts` & `src/store/documentStore.ts`)
- **Styling**: Tailwind CSS v4 + `lucide-react` icons + Radix/shadcn UI components
- **PDF Rendering**: `pdfjs-dist` (PDF.js) via WebWorker
- **PDF Manipulation & Export**: `pdf-lib` + `@pdf-lib/fontkit`

---

## 2. Global State Management (`src/store/editorStore.ts` & `src/store/documentStore.ts`)

The application state is managed by Zustand stores (`useEditor` & `useDocumentStore`).

### Key Responsibilities:

- **File & Tab Management**: Keeps references to open documents (`documentStore.ts`), active tab order, and tracks `dirty` states.
- **Tools & UI Modes**: Tracks active `tool` (`select`, `highlight`, `redact`, `edit-text`, `textbox`, `pen`, `comment`), `zoom` level, `snapToGuides` toggle state, and `viewMode`.
- **Annotation Data**: All user overlays (highlights, redactions, drawn paths, textboxes, and comments) are stored in the `annotations` array using **PDF coordinate space** (points, bottom-left origin).
- **Undo/Redo System**: State-mutating actions push a snapshot of `annotations` and `pageOrder` into the `past` array. Calling `undo()` restores the latest snapshot from `past`.
- **Drag & Resize History Optimization**: History snapshot flooding is prevented by taking a single undo snapshot at pointer down (`onDragStart`), running subsequent coordinates updates silently with `commitToHistory = false`.

---

## 3. PDF Coordinate System & Subpixel Alignment Engine (`src/lib/pdf/screen.ts` & `alignmentEngine.ts`)

To ensure annotations stay perfectly aligned regardless of zoom level or display size, all persistence strictly uses **PDF user space points**.

- **PDF Space**: Origin `(0,0)` is at the **bottom-left** of the page. Y-axis increases upwards.
- **Screen Space (Browser)**: Origin `(0,0)` is at the **top-left**. Y-axis increases downwards.
- **Conversion Methods**: `pdfPoint(screenX, screenY, viewport)` and `screenRect(pdfRect, viewport)` map coordinates back and forth using the current PDF.js `Viewport` transform matrix.

### 3.1 Glyph Center-Height Alignment & Subpixel GPU Engine

1. **Letter Center-Height Alignment**:
   To achieve 0.000px vertical baseline and middle-height alignment, `alignmentEngine.ts` measures the exact 2D canvas `measureText(str)` glyph bounding box metrics (`actualBoundingBoxAscent`/`Descent`):
   $$\text{glyphCenterY} = tx[5] - \frac{\text{actualBoundingBoxAscent} - \text{actualBoundingBoxDescent}}{2}$$
   $$\text{domTop} = \text{glyphCenterY} - \frac{\text{fontHeight}}{2}$$
   This positions the vertical middle of the HTML text box **EXACTLY over the vertical middle of the PDF text glyphs**.
2. **Subpixel GPU Composition (`translate3d`)**:
   Text replacement containers in `PageView.tsx` use `transform: translate3d(leftPx, topPx, 0px)`. `translate3d` leverages floating-point GPU composition, preventing browser integer pixel snapping across fractional zoom levels (100%, 125%, 150%, 200%).
3. **Subpixel Anti-Aliasing Cover Mask**:
   The white background cover box extends by a 0.75px subpixel margin (`top: -0.75px`, `height: calc(100% + 1.5px)`), masking 100% of underlying gray canvas anti-aliasing fringe pixels.
4. **CSS Font Smoothing**:
   Applied `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;` so DOM text stem rendering matches PDF.js 2D canvas rendering.

---

## 4. UI Architecture & View Layer

The UI lives inside `src/components/editor/`:

- **`PdfStudio.tsx`**: The main root component. Orchestrates file loading, exporting, printing, and tab management.
- **`Toolbar.tsx`**: Top navigation for tools, zoom controls, saving, magnet snap toggle, and formatting options. Context-sensitive.
- **`TabBar.tsx`**: Multi-document tab bar styled with `bg-card` and top primary accent borders (`border-t-2 border-t-primary`), rendered directly below the Toolbar.
- **`PageView.tsx`**: The workhorse component for a single PDF page.
  - Renders a `<canvas>` using `pdfjs-dist`.
  - Creates a transparent HTML DOM overlay to enable native text selection.
  - Manages pointer events (`onPointerDown`, `onPointerMove`) to draw highlights, redaction boxes, and pens in real-time.

### 4.1 UI Viewport CSS-Transforms for Text Layers

1. **Combine Matrices**: Viewport matrix and text item matrix are combined: `tx = transformMatrix(viewport.transform, item.transform)`.
2. **Screen Font Height**: Computed via $H_{\text{font}} = \sqrt{tx_2^2 + tx_3^2}$.
3. **Screen Rotation Angle**: Computed via `angle = Math.atan2(tx[1], tx[0])`.
4. **Positioning**: Container positioned using `transform: translate3d(leftPx, topPx, 0px) rotate(${angle}rad) scaleX(${scaleX})`.
5. **Text Replacement Scaling (1:1 Congruency)**: Real-time 2D canvas text width measurement applies dynamic `scaleX` scaling and a 4px safety width buffer (`containerWidth = Math.max(origWidth, measuredWidth + 4)`) to guarantee zero character truncation.

### 4.2 Non-Blocking Tooltips & Layer Hierarchy

1. **Hierarchy**: `Toolbar` (`z-[100]`) -> `TabBar` (`z-[150]`) -> Dropdown Menus (`z-[200]`) -> Tooltips (`z-[300]`).
2. **Bottom-Popping Tooltips**: Tooltips use `side="bottom"` and `sideOffset={8}` in `src/components/ui/tooltip.tsx` & `Toolbar.tsx`, projecting downwards into canvas workspace space below toolbar buttons.
3. **Non-Blocking Clicks**: Tooltips feature `pointer-events-none select-none`, guaranteeing tooltips never block mouse hover or clicks on adjacent toolbar buttons.

### 4.3 InDesign UI Handles & Color Pipette

1. **InDesign-Style Handles**: Textboxes and selection boxes use 6px square handles (`w-2 h-2 rounded-[1px] bg-white border border-primary shadow-2xs z-30`) without interior icons.
2. **Height Scaling**: Textbox height `anno.h` scales dynamically in PDF space via top, bottom, and corner handles. Initial text created as empty `text: ""`.
3. **Color Picker with Eyedropper (`ColorPickerWithEyedropper.tsx`)**: Reusable component featuring color swatches, native HTML `<input type="color">`, and Browser Eyedropper API (`window.EyeDropper`).

---

## 5. Advanced PDF Manipulation Tools

### 5.1 Real Redaction (`ContentStreamEditor.ts`)

1. Decodes raw PDF `Contents` stream.
2. `tokenizeStream()` parses PDF operators into discrete tokens.
3. `filterRedactedText()` calculates rendered glyph bounding boxes and physically deletes redacted text operators from the content stream bytes.
4. Serializes cleaned tokens and draws black redaction rectangles via `pdf-lib`.

### 5.2 Atomic Font Resolution & Alignment

1. **Atomic Font Matching Sequence**: `replaceSpan()` in `PageView.tsx` combines font header descriptor resolution (`getFontInfo`) and KNN vector matching (`matchSingleFontOnPage`) into a single atomic sequence before updating `fontFamily`, eliminating double-update UI flickers.
2. **Deterministic Offline KNN Font Recognition**: Matches character glyph vectors against local SQLite database (`public/font-fingerprints.db.gz`) for 1,950+ Bunny/Google fonts.
3. **Style and Color Preservation**: Preserves original text color (`item.color`), `bold`, `italic`, and font metrics.

### 5.3 Comment System & Sidebar Filtering (`CommentsPanel.tsx`)

1. **Sidebar Filtering**: Recognized PDF text (`textReplace`) is explicitly excluded from the Comments sidebar list.
2. **Multitype Support**: Pen drawings (`ink`), highlighters (`highlight`), sticky notes (`comment`), underlines, and strikeout annotations with text or reply threads are listed.

### 5.4 Locked System & Architecture Rules

> [!IMPORTANT]
> **Mandatory Architecture & Layout Rules (Locked Rules)**:
>
> 1. **Header Layout & Navigation**:
>    - Layout hierarchy: `Toolbar` (top, `z-[100]`) -> `TabBar` (directly below, `z-[150]`) -> Canvas workspace.
>    - `StatusBar` is permanently removed.
>
> 2. **Off-screen Canvas Rendering**:
>    - Must use a clean `document.createElement("canvas")` buffer without `globalCanvasPool` eviction.
>    - Prevents VRAM memory leaks, zoom lag, and white/blank pages.
>
> 3. **Subpixel Alignment Formula**:
>    - Exact alignment calculation (`src/lib/pdf/alignmentEngine.ts`): $\text{glyphCenterY} = tx[5] - \frac{\text{ascent} - \text{descent}}{2}$, $\text{domTop} = \text{glyphCenterY} - \frac{\text{fontHeight}}{2}$, `lineHeight: 1`, `padding: 0`, `margin: 0`, `whiteSpace: "pre"`.
>    - Guarantees 0.000px vertical deviation relative to PDF.js text layer spans across multi-zoom scales.
>
> 4. **Non-Blocking Tooltips & Z-Index Layering**:
>    - Tooltips (`src/components/ui/tooltip.tsx`) use `side="bottom"`, `sideOffset={8}`, `pointer-events-none select-none` at `z-[300]`.
>    - Tooltips pop up BELOW toolbar buttons and never block clicks on adjacent tools.

---

## 6. Development & Testing Workflow

- **Unit & Integration Testing**: Vitest (`npm test` / `npx vitest run`). All 31 test files and 137 unit tests passing.
- **E2E Testing**: Playwright test suite (`e2e/pixelAlignment.spec.ts`) verifying multi-zoom subpixel alignment ($\le 0.007\text{px}$ drift) and non-blocking tooltips (`npx playwright test`).
- **Proof Screenshot**: `e2e/screenshots/pixel_alignment_proof.png`.

_End of Document. Read this file fully before starting any task on PDF Studio._

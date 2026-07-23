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
- **State Management**: Zustand v5
- **Styling**: Tailwind CSS v4 + `lucide-react` icons + Radix/shadcn UI components
- **PDF Rendering**: `pdfjs-dist` (PDF.js) via WebWorker
- **PDF Manipulation & Export**: `pdf-lib` + `@pdf-lib/fontkit`

---

## 2. Global State Management (`src/store/editorStore.ts`)

The application state is entirely managed by a single Zustand store: `useEditor`.

### Key Responsibilities:

- **File Management**: Keeps references to `originalBytes`, `fileHandle` (File System Access API), and tracks the `dirty` state.
- **Tools & UI Modes**: Tracks the active `tool` (`select`, `highlight`, `redact`, `edit-text`, `textbox`, `pen`, `comment`), `zoom` level, and `viewMode` (`fit-width`, `two-page`, etc.).
- **Annotation Data**: All user overlays (highlights, redactions, drawn paths, textboxes, and comments) are stored in the `annotations` array. Each annotation strictly uses **PDF coordinate space** (points, bottom-left origin).
- **Undo/Redo System**: Whenever a state-mutating action occurs (e.g., `addAnnotation`, `updateAnnotation`, `deletePage`), a snapshot of `annotations` and `pageOrder` is pushed into the `past` array. Calling `undo()` moves the current state into `future` and restores the latest snapshot from `past`.
- **Drag & Resize History Optimization**: During dragging or resizing operations, history snapshot flooding is prevented by taking a single undo snapshot at pointer down (`onDragStart`), and then running subsequent coordinates updates silently with `commitToHistory = false`.

---

## 3. PDF Coordinate System (`src/lib/pdf/screen.ts`)

To ensure annotations stay perfectly aligned regardless of zoom level or display size, all persistence strictly uses **PDF user space points**.

- **PDF Space**: Origin `(0,0)` is at the **bottom-left** of the page. Y-axis increases upwards.
- **Screen Space (Browser)**: Origin `(0,0)` is at the **top-left**. Y-axis increases downwards.
- **Conversion Methods**: `pdfPoint(screenX, screenY, viewport)` and `screenRect(pdfRect, viewport)` map coordinates back and forth using the current PDF.js `Viewport` transform matrix.

### 3.1 Text Rotation and Matrix Transformations

Text elements in PDFs often carry complex transformation matrices that handle rotation, scale, and skewing. The matrix is represented as an array of six numbers `[a, b, c, d, tx, ty]`:

- `a` and `b` determine horizontal scaling and rotation: $a = \text{scaleX} \cdot \cos(\theta)$, $b = \text{scaleX} \cdot \sin(\theta)$
- `c` and `d` determine vertical scaling and rotation: $c = \text{scaleY} \cdot -\sin(\theta)$, $d = \text{scaleY} \cdot \cos(\theta)$
- `tx` and `ty` determine translation (X and Y position in PDF points)

To accurately compute character-level bounds for rotated text blocks:

1. **Scale Factor (X-Axis)**: calculated as $s_x = \sqrt{a^2 + b^2}$.
2. **Angle of Rotation ($\theta$)**: calculated as $\theta = \text{atan2}(b, a)$.
3. **Trigonometric Components**: $\cos(\theta) = a / s_x$, $\sin(\theta) = b / s_x$ (if $s_x > 0$, else defaults to $\cos(\theta) = 1, \sin(\theta) = 0$).
4. **Baseline Points**: For a glyph at offset fraction `frac` within an item of width $W$:
   - Offset start $x_{\text{off0}} = \text{frac}_{\text{before}} \cdot W$
   - Offset end $x_{\text{off1}} = \text{frac}_{\text{end}} \cdot W$
   - $x_0 = tx + x_{\text{off0}} \cdot \cos(\theta)$, $y_0 = ty + x_{\text{off0}} \cdot \sin(\theta)$
   - $x_1 = tx + x_{\text{off1}} \cdot \cos(\theta)$, $y_1 = ty + x_{\text{off1}} \cdot \sin(\theta)$
5. **Height Direction**: Extracted from the vertical transformation components: $h_x = c$, $h_y = d$.
6. **Bounding Box**: Calculated as:
   - $x_{\text{min}} = \min(x_0, x_1, x_0 + h_x, x_1 + h_x)$
   - $x_{\text{max}} = \max(x_0, x_1, x_0 + h_x, x_1 + h_x)$
   - $y_{\text{min}} = \min(y_0, y_1, y_0 + h_y, y_1 + h_y)$
   - $y_{\text{max}} = \max(y_0, y_1, y_0 + h_y, y_1 + h_y)$
     This ensures mathematically precise overlap checking during redaction and replacement.

---

## 4. UI Architecture & View Layer

The UI lives inside `src/components/editor/`:

- **`PdfStudio.tsx`**: The main root component. Orchestrates file loading, exporting, printing, and file system writes.
- **`Toolbar.tsx`**: Top navigation for tools, zoom controls, saving, and formatting options. Context-sensitive (e.g., FontPicker only shows when relevant).
- **`PageView.tsx`**: The workhorse component for a single PDF page.
  - Renders a `<canvas>` using `pdfjs-dist`.
  - Creates a transparent HTML DOM overlay to enable native text selection.
  - Manages pointer events (`onPointerDown`, `onPointerMove`) to draw highlights, redaction boxes, and pens in real-time, mapping screen movements to PDF space.

### 4.1 UI Viewport CSS-Transforms for Text Layers

To render the transparent text layer spans in perfect congruency with the underlying PDF canvas (especially for rotated text):

1. **Combine Matrices**: The viewport matrix and the text item's matrix are combined: `tx = transformMatrix(viewport.transform, item.transform)` (using custom affine matrix multiplication helper to avoid ESM/Node bundler dependency on `pdfjsLib.Util.transform`).
2. **Screen Font Height**: Computed via the hypotenuse of the vertical components: $H_{\text{font}} = \sqrt{tx_2^2 + tx_3^2}$.
3. **Screen Rotation Angle**: Computed via `angle = Math.atan2(tx[1], tx[0])`.
4. **Positioning**: The span is placed at `left: tx[4]` and `top: tx[5] - fontHeight`.
5. **Horizontal Scaling**: Since browser system font rendering dimensions can differ slightly from the PDF's embedded metrics, a horizontal scaling factor is applied: `scaleX = span.offsetWidth > 0 ? (item.width * zoom) / span.offsetWidth : 1`.
6. **CSS Transform**: Set dynamically as `transform: rotate(${angle}rad) scaleX(${scaleX})` with `transform-origin: left bottom` to align perfectly.
7. **Text Replacement Scaling (1:1 Congruency)**: For replacement textareas, the text width is measured in real-time using a 2D canvas context. A horizontal `scaleX` scaling factor is dynamically calculated (`scaleX = expectedWidth / naturalWidth`) and applied to the text box to stretch or compress the replacement text, guaranteeing that the letters align perfectly with the original PDF layout and never wrap.

### 4.2 Select Mode Pointer-Events Model

To support text selection and interaction under overlapping overlay divs:

- **Overlay Layer**: Placed on top of the text layer to capture pen, comment, and shape annotations.
- **Dynamic Pointer-Events Bypass**: In `select` or `edit-text` modes, pointer events are dynamically routed. On hover/move over the empty background, `pointerEvents` is temporarily toggled to `"none"` on the overlay, a `document.elementFromPoint` hit-test is performed to detect if the cursor is over a text layer span, and then `pointerEvents` is restored to `"auto"`.
- If a text span is detected, the cursor changes to `text`, allowing the user to select, highlight, or copy the underlying text seamlessly.

### 4.3 Drag-and-Drop Page Reordering (Contiguous Layouts)

To ensure a smooth, gapless drag-and-drop page reordering experience in both `ThumbnailRail` (sidebar) and `GridOverview` (full screen grid):

1. **Outer Drag Wrapper**: Rather than having gaps or margins between draggable elements (which leads to dead zones where the browser displays a forbidden/blocked cursor), draggable elements are wrapped in an outer wrapper `div`.
2. **Eliminating Dead Zones**:
   - In the sidebar `ThumbnailRail`, spacing is removed, and wrapper `div`s have a `py-1.5` padding. This makes the outer boundary of adjacent elements meet exactly, leaving zero dead space.
   - In the full screen `GridOverview`, grid gaps are removed, and wrapper `div`s use `p-2` padding to construct a seamless contiguous matrix.
3. **Midpoint-Based Drop Swaps (50% rule)**:
   - For vertical drag-over (`ThumbnailRail`), the cursor `clientY` is compared against the vertical midpoint of the element (`top + height / 2`) to decide whether the page is inserted `before` or `after` the target.
   - For 2D drag-over (`GridOverview`), normalized cross-multiplication (`Math.abs(dx * rect.height) > Math.abs(dy * rect.width)`) is used to map the pointer to one of four triangular quadrants (left, right, top, bottom), determining both horizontal and vertical insertion sides.
4. **Centering Drop Indicators**: The visual drop line is absolute positioned and offset by the exact wrapper padding size (e.g., `-translate-y-0.5` or `-translate-x-0.5` representing 2px translates) to render precisely centered in the gap between the visual cards.

### 4.4 Mobile Responsiveness Strategy (`< 768px`)

To deliver a premium mobile experience without altering desktop behavior ($\ge 768\text{px}$):

1. **Slide-Over Overlays / Drawers**:
   - `ThumbnailRail.tsx` (pages sidebar) and `CommentsPanel.tsx` render as fixed full-screen slide-over drawers (`z-50`) on mobile (`< md`).
   - Accompanied by a semi-transparent backdrop overlay (`bg-black/40 backdrop-blur-xs`) that closes the drawer upon tapping.
   - On desktop ($\ge md$), panels retain their standard inline flexbox container placement.
2. **Mobile Overflow Menu Accessibility**:
   - The Search & Redact tool is integrated into the mobile compact overflow dropdown menu (`⋮` in `Toolbar.tsx`), ensuring full feature parity on small screens.
3. **Sub-Toolbar Touch Scrolling**:
   - Tool settings (colors, pen sizes, font picker, line height selector) wrap in a `.subtoolbar-scroll` container with hidden scrollbars for smooth touch-based horizontal panning.
4. **Mobile Touch Gestures**:
   - **2-Finger Pinch-to-Zoom**: Multi-touch listeners on the `<main>` viewport intercept two-finger pinches to adjust zoom levels dynamically while preserving single-finger panning.
   - **1-Second Long-Press Touch Drag (Grid View)**: In `GridOverview.tsx`, holding a page thumbnail for 1,000ms triggers haptic feedback (`navigator.vibrate`) and activates touch drag-and-drop page reordering with a floating drag avatar.
5. **Responsive Floating Panels**:
   - `SearchRedactPanel.tsx` and `CropToolPanel.tsx` use clamped max-widths (`calc(100vw - 1rem)`) to fit 320px–360px viewports without horizontal clipping.

---

## 5. Advanced PDF Manipulation Tools

### 5.1 Real Redaction (`ContentStreamEditor.ts`)

Standard PDF editors often "redact" by just drawing a black box over the text, which allows users to easily copy-paste the hidden text underneath. This project implements **True Redaction**:

1. When exporting (`export.ts`), the system identifies all `RedactAnno` and `TextReplaceAnno` areas.
2. It decodes the raw PDF `Contents` stream (zlib uncompress).
3. `tokenizeStream()` parses the PDF operators (e.g., `TJ`, `Tj`, `Do`, matrices) into discrete tokens.
4. `filterRedactedText()` calculates the bounding box of every single rendered glyph. If a glyph intersects with a redaction rectangle, that specific character is **physically deleted** from the stream's string operator.
5. The cleaned stream is serialized back into bytes (`serializeTokens`) and replaces the old page content.
6. A black rectangle is then drawn over the redacted area using `pdf-lib`.

### 5.2 Text Replacement & Font Resolution

Users can select existing PDF text and replace it.

1. The underlying original text is physically deleted using the exact same algorithm as Redaction (see above).
2. The new text must be drawn over the blanked region using a font that matches the original.
3. **Deterministic Offline KNN Font Recognition**: To accurately identify unknown or subset-prefixed fonts (e.g., `ABCDEF+TimesNewRoman`), the engine extracts character glyph vectors (width and outline geometries) from the PDF. These features are matched in a client-side WebWorker against a local SQLite database (`public/font-fingerprints.db.gz`) containing gzipped fingerprints for all 1,950+ Google/Bunny Fonts:
   - **Pruning**: Candidate selection by character-level topology (count of closed holes) and Hu-moments (L2 distance).
   - **Tie-breaker**: Mean Absolute Error (MAE) comparison of character advance widths scaled to 1000 UPEM.
   - **Validation**: Strict IoU validation of raster masks on key discriminator characters.
   - **Loading UI Overlay**: Switching to the Text Edit tool with an uninitialized SQLite worker shows a full-screen overlay blocking interactions. It renders a spinner under 1 second of load time, and automatically switches to an animated progress bar beyond 1 second.
   - **Readiness Sync**: The WebWorker dispatches a `READY` message once database loading and `pako` extraction is complete. Matching requests wait on this event to avoid race conditions or premature fallback failures.
   - **Retroactive Font Updates**: When matching finishes, annotations on the page configured with fallback font families (like Helvetica) are automatically updated with the newly resolved font properties.
   - **Corrected Font Caching**: Once a font name is resolved via the KNN matcher, it is cached directly in `fontInfoRef.current` with its corrected family name. This prevents subsequent clicks on text segments sharing that font from losing the recognized font name and falling back to Helvetica.
4. **Style and Color Preservation**: In `PageView.tsx`, the original text color is extracted from the PDF (`item.color`) and parsed into hex format (defaulting to black RGB `[0, 0, 0]` if missing). Key formatting metrics (`bold`, `italic`, and `family`) are preserved from the KNN matcher, and raw subset names (like `TTF4t00` or `g_d0_f1`) are detected and filtered out via `isGarbageFontName` validation to prevent font overrides.
5. **Manual Font Selection**: The font selection dropdown (`FontPicker.tsx`) is statically populated with all 1,950+ Bunny Fonts (`src/lib/pdf/font-families.json`), which are downloaded and rendered on-the-fly when selected.
6. **Embedding**: `@pdf-lib/fontkit` embeds the TrueType (`.ttf`) font bytes (downloaded from Bunny Fonts proxy) during export, ensuring identical appearance on any device.
7. If a font cannot be resolved, it falls back to standard Helvetica (`StandardFonts.Helvetica`).

### 5.3 Highlighting, Drawing & Image Overlays

- **Highlights**: `pdf-lib` draws a rectangle with the selected color and a 40% opacity.
- **Pen Tool**: Uses `perfect-freehand` for smooth stroke generation in the UI. On export, the stored PDF-space points are drawn as vector line segments using `page.drawLine`.
- **Images**: Automatically detected via PDF.js operator lists (`detectImages()`). Users can move them. The export system embeds the replacement Base64 PNG/JPG using `pdf-lib` and draws it at the new coordinates.
- **Image Selection & Interaction Pattern**:
  - In `select` mode, hovering over an image renders a dashed outline (`border border-dashed border-primary/40`).
  - Clicking on the image selects it, displaying a solid primary border (`ring-2 ring-primary`) along with action controls:
    - **MoveHandle**: Allows the user to drag and reposition the image.
    - **ResizeHandle**: Allows the user to scale the image dimensions.
    - **DeleteBtn**: Allows the user to physically delete the image annotation.

### 5.4 Intelligent Paragraph & Line Detection Engine (`src/lib/pdf/paragraphGroup.ts`)

To allow editing multi-line text blocks and paragraphs as single cohesive elements:

1. **Detection Algorithm**: `detectParagraphs(rawItems)` sorts PDF text items top-to-bottom and left-to-right, grouping adjacent items into lines, and lines into paragraphs when:
   - Line Y-gaps satisfy $0.7 \times \text{fontSize} \le \Delta Y \le 2.2 \times \text{fontSize}$.
   - Left margins align within $30\text{pt}$.
   - Font sizes match within $\pm 2\text{pt}$.
2. **Paragraph Block Editing**: Clicking any text line within a paragraph selects the full multi-line block into a single `textReplace` annotation (with embedded `\n` line breaks).
3. **Max Width Measurement**: `containerWidth` calculates the max width across **all lines** in the paragraph plus a 14px buffer, preventing mid-word text wrapping (`wordBreak: "keep-all"`).
4. **Formatting Preservation**: Scans all items within a paragraph to retain `bold` / `italic` flags (e.g., bold headings like `"Absender:"`).
5. **Adjustable Line Height (Zeilenabstand)**: `FontPicker.tsx` includes an explicit Line Height selector (`1.0` to `2.0`). Line height is detected automatically from PDF item gaps and applied to both DOM textarea styling and PDF export rendering.

### 5.5 Viewport Text Alignment & Scrollbar Suppression

1. **1:1 Vertical Baseline Alignment**: `<textarea>` elements in `PageView.tsx` use `top = transform ? tx[5] - fontHeight : tx[5]`, `lineHeight: 1`, `padding: 0`, and `transform-origin: 0 0` to achieve 0.0000px vertical offset relative to PDF.js text layer spans.
2. **Scrollbar Elimination**: Global CSS rules in `src/styles.css` (`scrollbar-width: none !important`, `::-webkit-scrollbar { display: none !important }`) completely suppress native browser scrollbars inside text replace boxes.

### 5.6 Feedback System & Cloudflare D1 Integration (`FeedbackWidget.tsx`)

- **Floating Widget**: Persistent floating button in bottom-right corner opening a category-based feedback dialog (Wish, Criticism, Bug, UI Improvement).
- **Backend API**: Submits feedback to Cloudflare D1 Worker endpoint (`https://feedback-pdf.semole.workers.dev/`).
- **Konami Code Admin Mode**: Entering the Konami Code (`↑ ↑ ↓ ↓ ← → ← → B A`) inside the feedback modal unlocks administrative features (viewing, grouping, and deleting feedback entries via API key authentication).

---

## 6. Development & Testing Workflow

- **Unit & Integration Testing**: Powered by Vitest (`npm test` / `npx vitest run`).
- **E2E Testing**: Playwright test suite (`e2e/`) for visual layout, alignment, and interactive workflow verification (`npx playwright test`).
- **Vector Alignment Proof Generator**: `src/__tests__/pdf/generateProof.test.ts` generates automated markdown and JSON proof reports verifying 100.00% position accuracy ($\Delta X = 0.0000\text{pt}, \Delta Y = 0.0000\text{pt}$) against test PDFs.
- **Internationalization**: Handled by `src/lib/i18n.tsx`. Use `useI18n().t('key')` for all user-facing strings.

_End of Document. Read this file fully before starting any task on PDF Studio._

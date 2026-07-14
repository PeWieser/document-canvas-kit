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
3. **Font Detection** (`fontDetect.ts`): The system parses the internal PDF font name (e.g., stripping subset prefixes like `ABCDEF+Helvetica-Bold`) to determine the closest standard web font.
4. **Font Fetching**: `getFontBytes()` asynchronously downloads the TrueType (`.ttf`) file for that font from Google Fonts (via Bunny Fonts proxy).
5. **Embedding**: `fontkit` embeds the downloaded TTF into the PDF via `pdf-lib` so the final output contains the correct vector font, ensuring it looks identical on any device.
6. **Matrix & Width Integration**: `TextReplaceAnno` has been extended to include `transform?: number[]` and `width?: number`. These store the original text block's rotation/scale matrix and physical width, allowing the replacement text to be drawn with the exact same angle and size constraints upon export.
7. If a font cannot be fetched, it safely falls back to standard Helvetica (`StandardFonts.Helvetica`).

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

---

## 6. Development & Testing Workflow

- **E2E Testing**: Addressed via standard workflows (Vitest).
- **Sub-Agents**: Specific tasks (like Font-QA or Bug-Fixing) should leverage `Vitest` and `happy-dom` (`vitest.config.ts`) to simulate edge cases and font-matching thresholds.
- **Internationalization**: Handled by `src/lib/i18n.tsx`. Use `useI18n().t('key')` for all user-facing strings.

_End of Document. Read this file fully before starting any task on PDF Studio._

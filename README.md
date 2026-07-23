# PDF Studio (Web-First Document Canvas)

PDF Studio is a high-performance, web-first PDF editor designed for edge deployments. It enables rendering, annotation, true redaction, text replacement, and document manipulation entirely in the browser.

---

## 🚀 Key Features

- **Real Redaction**: Physically removes text glyphs from the PDF content stream rather than simply painting a black rectangle over them, ensuring data privacy.
- **Intelligent Paragraph & Line Detection**: Automatically groups adjacent PDF text items into coherent multi-line paragraphs (`paragraphGroup.ts`), preserving line breaks, max-width formatting, and bold/italic headings.
- **Text Replacement & Font Matching**: Detects embedded subset fonts via offline KNN matcher, fetches matching TrueType fonts from CDN, and embeds them dynamically.
- **1:1 Vector Deckungsgleichheit Alignment**: Mathematically aligns replacement text boxes and exported glyphs to $0.0000\text{pt}$ position offset relative to original PDF baselines.
- **Vector Annotation Overlays**: Highlights, drawings (via freehand vectors), textboxes, and image overlays.
- **Mobile Touch Responsiveness**: Slide-over drawers for sidebars with backdrop blur, 2-finger touch pinch-to-zoom on main canvas, and 1-second long-press touch drag-and-drop page reordering in Grid View.
- **Feedback System**: Floating feedback modal connected to Cloudflare D1 with Konami Code admin controls (`↑ ↑ ↓ ↓ ← → ← → B A`).

---

## 🛠️ Tech Stack & Infrastructure

- **Framework**: React 19 + TanStack Start (SSR/Nitro)
- **Hosting/Build**: Managed by Lovable, target Cloudflare pages / workers
- **Backend/DB**: Cloudflare D1 (Feedback endpoint)
- **State Management**: Zustand v5 (Store with Undo/Redo history)
- **PDF Rendering**: PDF.js (`pdfjs-dist`) via Web Workers
- **PDF Editing**: `pdf-lib` + `@pdf-lib/fontkit` for font embedding
- **Testing**: Vitest with `happy-dom` browser simulation + Playwright E2E

---

## 📐 Advanced Mathematical & Interaction Models

### 1. Text Rotation & Matrix Transformations (`ContentStreamEditor.ts` & `export.ts`)

Text positioning and rotation in PDF user space rely on 6-component transformation matrices `[a, b, c, d, tx, ty]`.
When determining if a rotated text glyph falls within a redaction or replacement area, the editor extracts:

- **Scale Factor**: $s_x = \sqrt{a^2 + b^2}$
- **Rotation Angle**: $\theta = \text{atan2}(b, a)$
- **Trigonometric Matrix Alignment**: $\cos(\theta) = a / s_x$, $\sin(\theta) = b / s_x$ (if $s_x > 0$, else default to $1$ and $0$).
- **Baseline and Height Vectors**: Combines baseline endpoints and vertical offsets $h_x, h_y = [c, d]$ to yield an exact bounding box for every single character glyph.

`TextReplaceAnno` carries `transform` and `width` matrix fields to ensure replacement text retains the original skew, scale, and rotation during export.

### 2. Viewport CSS-Transforms for Text Layers (`PageView.tsx`)

To achieve pixel-perfect congruency between the rendered PDF canvas and the interactive HTML text selection layer, the editor dynamically transforms the `<span />` elements:

1. Multiplies the PDF.js viewport transform by the text's transform matrix.
2. Extracts screen font height ($\text{height} = \sqrt{tx_2^2 + tx_3^2}$) and rotation angle ($\text{angle} = \text{atan2}(tx_1, tx_0)$).
3. Compensates for system font sizing discrepancies using a horizontal scale factor:
   $$\text{scaleX} = \frac{\text{width}_{\text{PDF}} \cdot \text{zoom}}{\text{width}_{\text{span}}}$$
4. Appended via CSS: `transform: rotate(${angle}rad) scaleX(${scaleX})` with `left` and `top` positioning offsets (`top = tx[5] - fontHeight`, `lineHeight = 1`, `transform-origin = 0 0`) for 0.0000px vertical baseline parity.

### 3. Select Mode Pointer-Events Model

To support browser-native text selection and annotation editing concurrently:

- **Dynamic Pointer-Events Bypass**: In `select` and `edit-text` modes, the interaction overlay captures pointer-down triggers for drawing or resizing annotation handles.
- During mouse movements (`onOverlayPointerMove`) over blank spaces, the overlay toggles `pointerEvents = "none"`, checks if the cursor is hovering over a text layer span via `document.elementFromPoint`, and immediately restores `pointerEvents = "auto"`.
- If a span is hit, the cursor switches to `text`, enabling normal text selection without disabling overlay interaction for annotations.

### 4. Image Selection & Actions

- Hovering over a detected image renders a dashed border (`border-dashed border-primary/40`).
- Clicking the image applies a solid outline (`ring-2 ring-primary`) and exposes interaction anchors:
  - **MoveHandle** for repositioning.
  - **ResizeHandle** for scaling.
  - **DeleteBtn** for removing the image overlay.

### 5. Intelligent Paragraph & Line Detection Engine (`paragraphGroup.ts`)

- `detectParagraphs(rawItems)` groups adjacent text items top-to-bottom and left-to-right into cohesive multi-line paragraphs based on vertical line spacing ($0.7 \times \text{fontSize} \le \Delta Y \le 2.2 \times \text{fontSize}$) and font metrics.
- Measures max line width across **all lines** in a paragraph block to prevent mid-word HTML line wrapping (`wordBreak: "keep-all"`).
- Features adjustable Line Height controls (`FontPicker.tsx`) ranging from `1.0` to `2.0`.

---

## 5. Development & Test Commands

- **Install dependencies**: `npm install`
- **Start dev server**: `npm run dev`
- **Run Vitest unit tests**: `npm test` or `npx vitest run`
- **Run Playwright E2E tests**: `npx playwright test`
- **Run Deckungsgleichheit Proof generator**: `npx vitest run src/__tests__/pdf/generateProof.test.ts`


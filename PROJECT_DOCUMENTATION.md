# Project Documentation - PDF Studio (Web-First Document Canvas)

This documentation serves as a comprehensive guide and onboarding manual for developers and AI agents joining the project. It details the architecture, module dependencies, and exact technical implementations of the PDF Studio application.

---

## 1. Core Stack & Infrastructure

The project is built around a modern, performant React stack designed for edge deployments.

> **CRITICAL RESTRICTION**: 
> The build and deployment infrastructure is strictly managed by **Lovable** and targets **Cloudflare** via Nitro.
> Do **NOT** modify the following files unless specifically requested:
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

---

## 4. UI Architecture & View Layer

The UI lives inside `src/components/editor/`:

- **`PdfStudio.tsx`**: The main root component. Orchestrates file loading, exporting, printing, and file system writes.
- **`Toolbar.tsx`**: Top navigation for tools, zoom controls, saving, and formatting options. Context-sensitive (e.g., FontPicker only shows when relevant).
- **`PageView.tsx`**: The workhorse component for a single PDF page.
  - Renders a `<canvas>` using `pdfjs-dist`.
  - Creates a transparent HTML DOM overlay to enable native text selection.
  - Manages pointer events (`onPointerDown`, `onPointerMove`) to draw highlights, redaction boxes, and pens in real-time, mapping screen movements to PDF space.

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
6. If a font cannot be fetched, it safely falls back to standard Helvetica (`StandardFonts.Helvetica`).

### 5.3 Highlighting, Drawing & Image Overlays
- **Highlights**: `pdf-lib` draws a rectangle with the selected color and a 40% opacity.
- **Pen Tool**: Uses `perfect-freehand` for smooth stroke generation in the UI. On export, the stored PDF-space points are drawn as vector line segments using `page.drawLine`.
- **Images**: Automatically detected via PDF.js operator lists (`detectImages()`). Users can move them. The export system embeds the replacement Base64 PNG/JPG using `pdf-lib` and draws it at the new coordinates.

---

## 6. Development & Testing Workflow

- **E2E Testing**: Addressed via standard workflows (Vitest).
- **Sub-Agents**: Specific tasks (like Font-QA or Bug-Fixing) should leverage `Vitest` and `happy-dom` (`vitest.config.ts`) to simulate edge cases and font-matching thresholds.
- **Internationalization**: Handled by `src/lib/i18n.tsx`. Use `useI18n().t('key')` for all user-facing strings.

*End of Document. Read this file fully before starting any task on PDF Studio.*

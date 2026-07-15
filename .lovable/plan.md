## Ziel

Vier Verbesserungen an PDF Studio:
1. Redact-Rechtecke im Export deckungsgleich zur Vorschau
2. „Suchen & Schwärzen" Funktion
3. Erweiterte Stift-Optionen (Stiftarten + Farbwähler)
4. Kontextmenü auf Seiten-Thumbnails: einzelne Seiten exportieren + zuschneiden mit Vorschau

---

### 1. Redact-Offset-Bug (Export ≠ Vorschau)

**Diagnose:** In `src/lib/pdf/export.ts` werden Redact-Rechtecke direkt mit `page.drawRectangle({ x: a.rect.x, y: a.rect.y, ... })` in Roh-Koordinaten gezeichnet. Vorschau nutzt aber `pdfPoint()` von `pdf.js`, das CropBox-Offset und Seitenrotation berücksichtigt. Bei PDFs mit CropBox ≠ (0,0) oder Rotation ≠ 0 sitzt die Schwärzung im Export verschoben. Gleiches Problem gilt für die Redact-Rects, die an `filterRedactedText` gehen (Content-Stream ist in unrotierter Raum-Koordinate, CTM basiert auf MediaBox).

**Fix:**
- Neue Helper `pdfSpaceToRaw(rect, page)` in `export.ts`: liest `MediaBox` und `CropBox` via pdf-lib, korrigiert `Rotate` (0/90/180/270), transformiert Rect zurück in Raw-Space vor `drawRectangle` und vor `filterRedactedText`.
- Selbe Korrektur für `highlight`, `textReplace.rect`, `textbox`, `pen.points`, `image.rect` in einer einzigen Konversionsstelle beim Betreten der Page-Loop.
- Test in `src/__tests__/pdf/export.test.ts`: rotiertes 90°-PDF + Redact → Rect landet im erwarteten Bereich; CropBox-Offset-PDF → Rect deckungsgleich.

### 2. Suchen & Schwärzen

- Neue UI: `SearchRedactPanel` als Overlay (Cmd/Ctrl+F öffnet). Eingabefeld, Optionen „Groß-/Kleinschreibung", „Ganze Wörter", „Regex".
- Suche über alle geladenen Seiten via bereits vorhandenem `getPageTextItems`: pro `TextItem` Substring-Match, aggregiere PDF-Space-Rects (aus `transform` + gemessener Glyph-Breite; für Teilstrings anteilig).
- Ergebnisliste: Seite + Kontext-Snippet, Klick springt hin und markiert Treffer temporär.
- Buttons „Aktuellen schwärzen", „Alle schwärzen": legt `RedactAnno` pro Treffer an (via `addAnnotation`).
- Store-Erweiterung: `searchOpen`, `setSearchOpen`. Ausgelöst durch neuen Button in Toolbar (Lupe-Icon neben Kommentar-Panel) und Kürzel.

### 3. Erweiterte Stift-Optionen

- `PenAnno` bekommt `style: "solid" | "marker" | "pencil" | "dashed"` (Defaults abwärtskompatibel = "solid").
- Rendering in `PageView` (SVG) und Export (`export.ts`) berücksichtigen Stilart:
  - marker = höhere Deckkraft-Kurve mit größerer Breite
  - pencil = viele kleine Segmente mit Jitter
  - dashed = `dashArray`
- Erweiterte Farbauswahl: `<input type="color">` neben Preset-Swatches im Sub-Toolbar (nur für `pen`); zusätzliches Style-Selector-Dropdown (Icons für Fineliner/Marker/Pencil/Dashed) mit Tooltips.
- Store: `penStyle` + Setter.

### 4. Thumbnail-Kontextmenü: Einzel-Export + Zuschneiden

**Rechtsklick auf Thumbnail(s) in `ThumbnailRail` und `GridOverview`:**
- Aktuelle Auswahl unterstützen (`selectedPages: number[]` im Store, Shift-Klick / Cmd-Klick).
- Menüeinträge: „Diese Seite exportieren", „Ausgewählte Seiten exportieren", „Zuschneiden…".
- Export nutzt bestehende `exportPdf(bytes, subsetOrder, annotations)` mit gefiltertem `pageOrder`.

**Crop-Dialog (`CropDialog.tsx`):**
- Modal mit Live-Vorschau der ersten gewählten Seite (Canvas-Render der Seite in Skalierung, Overlay-Rechteck mit 8 Griffen).
- Optionen: „Auf alle gewählten Seiten anwenden", „Nur diese Seite".
- Bestätigen setzt eine neue Annotation `CropAnno { page, rect }` (kombinierbar; bei mehrfachem Crop pro Seite: letzter gewinnt).
- Export in `export.ts`: pro Seite, falls `CropAnno` vorhanden → `page.setCropBox(x, y, w, h)` und `page.setMediaBox` optional; Redact- und Overlay-Koordinaten anschließend anwenden (nach der oben eingeführten Raw-Transform).
- Vorschau im Editor: `PageView` liest CropAnno, setzt CSS-Clip auf die gerenderte Seite, damit man den Crop schon vor dem Export sieht.

### Technische Details

- Betroffene Files:
  - `src/lib/pdf/export.ts` (Raw-Space-Transform, Crop, Pen-Styles)
  - `src/lib/pdf/types.ts` (`PenAnno.style`, neue `CropAnno`)
  - `src/store/editorStore.ts` (`penStyle`, `searchOpen`, `selectedPages`)
  - `src/components/editor/PageView.tsx` (Pen-Style-Rendering, Crop-Clip, Suchtreffer-Overlay)
  - `src/components/editor/Toolbar.tsx` (Suche-Button, Pen-Style-Picker, Color-Input)
  - `src/components/editor/ThumbnailRail.tsx` + `GridOverview.tsx` (Rechtsklick, Auswahl)
  - Neu: `src/components/editor/SearchRedactPanel.tsx`, `src/components/editor/CropDialog.tsx`, `src/components/editor/PageContextMenu.tsx`
- Tests:
  - `export.test.ts`: Redact bei rotierter/gecropter Seite, Crop-Export erzeugt kleinere Seite, Subset-Export enthält nur gewählte Seiten
  - `searchRedact.test.ts` (neu): Textsuche liefert korrekte Rects auf Test-PDF, Aktion legt Redact-Annos an

### Aus dem Scope ausgeschlossen

- Regex-Suche über Zeilenumbrüche hinweg (nur pro TextItem-Bereich)
- Nachträgliches Editieren eines Crops nach Bestätigen — nur „neu setzen"

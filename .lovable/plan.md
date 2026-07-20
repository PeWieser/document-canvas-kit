## Ziel

Das aktuelle „Zuschneiden“ (modaler `CropDialog`, jeder Klick zeichnet einen neuen Rahmen) wird ersetzt durch ein vollwertiges Werkzeug im Werkzeuge-Menü mit inline Live-Preview auf der Seite, persistentem Rahmen (Anfasser + Drag), Maßeingabe, Seiten-Auswahl und Rotation.

## 1. Neues Werkzeug im Tools-Menü

- `Tool` in `src/lib/pdf/types.ts` um `"crop"` erweitern.
- `Toolbar.tsx`: `crop` in `tools[]` (Icon `Crop`, Tooltip). Beim Aktivieren öffnet sich das schwebende Crop-Bedienfenster; der bisherige `CropDialog`-Aufruf aus dem Thumbnail-Kontextmenü entfällt (Menüpunkt „Zuschneiden“ setzt stattdessen `tool = "crop"` + `selectedPages`).

## 2. Persistenter Crop-Rahmen auf der Seite (statt Modal)

- `CropAnno` existiert bereits (`page`, `rect` in PDF-Space). Zusätzlich `rotation?: number` (Grad, −45…+45) ergänzen.
- `PageView.tsx`:
  - Wenn `tool === "crop"` und die Seite in `selectedPages` (bzw. „aktuelle Seite“/„alle“) enthalten ist, wird ein interaktiver Overlay-Layer gerendert:
    - Rechteck aus vorhandener `CropAnno` oder Default = ganze Seite (leicht eingerückt).
    - Bereich **außerhalb** des Rahmens wird mit `bg-black/50` abgedunkelt (via 4 Rechtecke oder `clip-path`).
    - 8 Anfasser (Ecken + Kanten) zum Skalieren, Innerer Bereich = Drag-to-move (Cursor `move`).
    - Klick **außerhalb** setzt den Rahmen nicht mehr zurück; Neuzeichnen nur über Button „Rahmen zurücksetzen“ im Bedienfenster.
  - Änderungen schreiben live per `updateAnnotation(cropId, { rect }, false)` (kein History-Push je Mousemove; Commit `pushHistorySnapshot()` auf `mouseup`).
  - Bei aktivierter `rotation` wird die Vorschau der Seite via CSS `transform: rotate(...)` innerhalb des Rahmens gedreht dargestellt (nur visuell während Bearbeitung).

## 3. Schwebendes Bedienfenster (Floating Panel)

Neue Komponente `CropToolPanel.tsx` (position: fixed, unten-mittig, klein, verschiebbar via Header-Drag). Bleibt beim scrollen über mehrere Seiten an seinem relativen Platz zur gesamten website. Enthält:

- **Seitenauswahl** (Radio):
  - Aktuelle Seite
  - Alle Seiten
  - Benutzerdefiniert → Text-Input im Stil „1-3, 5, 7-9“ (Parser liefert display indices)
- **Maße** (Zahlfelder, Einheit pt, mit „mm“-Umschalter optional; Skalierung bleibt auf **Rahmen-Mitte** zentriert):
  - Breite, Höhe
  - Änderungen zentrieren den Rahmen auf seinem alten Mittelpunkt.
- **Position** (X, Y) — read/write in PDF-Space.
- **Rotation**:
  - Feinrädchen-Slider (horizontaler „ticker“, ähnlich Apple Fotos): eigene Komponente `WheelSlider` (−45…+45°, 0.1° Steps, tick-Markierungen alle 1°/5°, Snap bei 0°).
  - Numerisches Grad-Eingabefeld daneben.
- **Buttons**: „Anwenden“ (schreibt Crop auf alle gewählten Seiten, jeweils gleiche relative Rect / Rotation), „Rahmen zurücksetzen“, „Crop entfernen“, „Schließen“ (setzt `tool = "select"`).

Panel-Layout kompakt (≈ 320×auto), Design gemäß Swiss/minimal (existierendes `bg-background border rounded-lg shadow-2xl`).

## 4. Mehrseiten-Zuschnitt

- „Anwenden“ iteriert über die aufgelösten Seiten (aktuell/alle/benutzerdefiniert) und legt/aktualisiert pro Seite eine `CropAnno` mit demselben `rect` und `rotation`. Bei bereits vorhandener Crop-Anno: `updateAnnotation`, sonst `addAnnotation`.
- Wenn Seiten unterschiedliche Größen haben: `rect` wird proportional an die Seitengröße geclamped (Info-Hinweis im Panel bei Größenunterschied).

## 5. Export

`src/lib/pdf/export.ts`:

- Vorhandene CropBox-Logik bleibt.
- Bei `rotation` ≠ 0: `page.setRotation(degrees(existingRotation + cropRotation))` — echte PDF-Rotation nur in 90°-Schritten möglich; feine Rotationen werden über Content-Stream-Wrap umgesetzt: neue Seite gleicher Cropgröße erzeugen, alte Seite via `embedPage` + `drawPage` mit `rotate: degrees(-r)` und passendem Translate zeichnen, dann Overlays.
- Fallback (falls `embedPage`-Rotation nicht sauber klappt): Rotation ≠ 0 wird auf nächstes Vielfaches von 90° gerundet und der Rest verworfen; Warnung im Panel.

## 6. Aufräumen

- `CropDialog.tsx` entfernen (oder auf reinen Re-Export von `CropToolPanel` reduzieren, um bestehende Imports nicht zu brechen — vorzugsweise Imports in `ThumbnailRail.tsx` / `PdfStudio.tsx` umstellen und Datei löschen).
- `ThumbnailRail` Kontextmenü-Eintrag „Zuschneiden…“ setzt: `setSelectedPages(pages)` → `setTool("crop")`.
- i18n-Keys ergänzen: `cropTool`, `cropWidth`, `cropHeight`, `cropX`, `cropY`, `cropRotation`, `cropApply`, `cropReset`, `pageSelectionCurrent|All|Custom`, `pageRangeHint`.

## Technische Details

**Betroffene Dateien**

- `src/lib/pdf/types.ts` — `Tool` + `CropAnno.rotation`.
- `src/store/editorStore.ts` — nichts strukturell Neues (nutzt vorhandene `selectedPages`, `tool`).
- `src/components/editor/PageView.tsx` — Overlay-Rendering + Interaktion (Anfasser, Drag, Dim-Layer, Rotationsvorschau).
- `src/components/editor/Toolbar.tsx` — `crop` in `tools[]`.
- `src/components/editor/ThumbnailRail.tsx` — Kontextmenü → Tool aktivieren.
- `src/components/editor/PdfStudio.tsx` — mountet `CropToolPanel`, wenn `tool === "crop"`.
- **Neu**: `src/components/editor/CropToolPanel.tsx`, `src/components/editor/WheelSlider.tsx`.
- `src/lib/pdf/export.ts` — Rotationsanwendung via `embedPage`.
- `src/lib/i18n.tsx` — neue Keys.
- `CropDialog.tsx` — entfernen.

**Interaktionsdetails**

- Handles: 8 `div`s absolut positioniert; `pointerdown` merkt Start-Rect + Handle-Typ; `pointermove` (auf `window`) berechnet neues Rect in Screen-Space → via bestehender Viewport-Konversion in PDF-Space; `pointerup` committet History.
- Skalierung „aus der Mitte“ nur für numerische Eingaben im Panel; Handle-Drag bleibt kantenorientiert (Standard-Erwartung).
- Verschieben: `pointerdown` innerhalb Rahmen (nicht auf Handle) startet Move.

**Tests**

- `src/__tests__/pdf/export.test.ts` erweitern: Crop mit Rotation ≠ 0 → exportierte Seite hat erwartete Größe und `embedPage`-Content ist vorhanden.
- Kleiner Unit-Test für Seitenbereich-Parser („1-3,5,7-9“).

## Nicht im Scope

- Nicht-rechteckige Crops (Ellipse/Freiform).
- Rotation > 45° (dafür ist die Standard-Seitenrotation im Datei-Menü zuständig).
- Persistieren des Floating-Panel-Positionsstands über Reloads.
# PDF Studio – Phasen 1–3

Umsetzung der Phasen 1 (Bugfixes), 2 (Font-Caching) und 3 (Design-Overhaul) aus `implementation_plan.md`, in einem Durchlauf. Alle Änderungen bleiben clientseitig; die in der Kompatibilitätsgarantie gesperrten Dateien (`vite.config.ts`, `server.ts`, `start.ts`, `router.tsx`, `routeTree.gen.ts`, `__root.tsx`, `index.tsx`, `.lovable/`) werden nicht angefasst.

---

## Phase 1 – Bugfixes

### 1.1 Schwärzen per Textauswahl

`PageView.tsx`:

- Textlayer wird auch bei `tool === "redact"` interaktiv (`textInteractive` erweitern), Cursor `text`.
- `onTextMouseUp` behandelt zusätzlich `redact`: liest `window.getSelection()`, wandelt jede `ClientRect` via `pdfPoint()` in PDF-Koordinaten und legt pro Fragment eine `RedactAnno` an (analog zur Highlight-Selektion). Rechteck-Zeichnen bleibt als Fallback erhalten.
- Kontextmenü-Eintrag „Schwärzen": bei vorhandener Textselektion die Selektion schwärzen, sonst wie bisher Bild/Fixpunkt.

`Toolbar.tsx`: Redact-Tooltip/Hint auf „Text auswählen → wird geschwärzt" anpassen (i18n-Key).

### 1.2 Schrifterkennung & FontPicker

`fontDetect.ts`:

- `psNameMap` erweitern (Calibri, Cambria, Verdana, Georgia, Trebuchet MS, Tahoma, Consolas, Courier New) inkl. Bold/Italic-Varianten.
- Subset-Prefix robuster strippen: Regex `^[A-Z]{6}\+`.
- Rein numerische/unbekannte CID-Namen → Erstellung eines Algorithmus, der Fonts erkennen kann und prüfen kann (bekannte fonts werden mit ausgelesener fontgröße und formatierung über originaltext gelegt und geprüft, ob eine Übereinstimmung (kanten da ist=.
- Schriftfarbenerkennung

`FontPicker.tsx` (neu): kompaktes Menü (Familie-Dropdown, Größe, Bold/Italic-Toggles, Farbwähler). Zeigt Werte der selektierten Annotation, ruft `updateAnnotation(id, {...})`. Familienliste = gängige Fonts + im Dokument erkannte.

`Toolbar.tsx`: `FontPicker` inline einblenden, wenn `tool` in `edit-text`/`textbox` **und** eine passende Annotation selektiert ist.

`export.ts`: `makeFontResolver` gibt bei fehlgeschlagener Einbettung ein Warn-Signal zurück; `exportPdf` sammelt fehlende Fonts und meldet sie über einen Toast (statt stillem Helvetica-Fallback).

### 1.3 Kommentare

`PageView.tsx` (`onOverlayPointerDown`, `comment`): vor dem Erstellen prüfen, ob ein bestehender Pin im Radius (~20 PDF-Punkte / Zoom) liegt → dann `select(existing.id)` statt neuem Pin.

`editorStore.ts`: State `commentsPanelOpen: boolean` (default false) + `toggleCommentsPanel()`.

`CommentsPanel.tsx` (neu): rechte Leiste, alle Kommentare nach Seite gruppiert, Status-Badge offen/erledigt, Klick springt zur Seite und selektiert, Antwort-Threads, Filter offen/erledigt/alle.

`PdfStudio.tsx`: `CommentsPanel` rechts rendern, wenn `commentsPanelOpen`.

`Toolbar.tsx`: Toggle-Button (rechts) für das Panel.

`export.ts`: Replies als verknüpfte Annotationen (`IRT`), `resolved` → `AS: /Completed`.

---

## Phase 2 – Font-Caching (Offline-First)

`fontCache.ts` (neu): Wrapper um die Cache Storage API (`getCachedFont`/`setCachedFont`, Cache `pdfstudio-fonts-v1`).

`fontDetect.ts`: `getFontBytes()` prüft zuerst den Cache, lädt sonst aus dem Netz und speichert das Ergebnis. Sicher gekapselt (kein Absturz, wenn `caches` fehlt, z. B. bei SSR).

---

## Phase 3 – Design-Overhaul (Swiss / Notion, hell & dunkel)

`styles.css`:

- Neue Tokens: warmes Weiß im Hellmodus, dezente steingraue Ränder, Toolbar/Sidebar kaum vom Canvas abgesetzt; Akzent Blau. Dunkelmodus in warmem Schiefergrau, Dokument-Canvas bleibt weiß.
- UI-Font auf System-Font-Stack umstellen (Mono-Stack bleibt für Zahlen).

Komponenten-Feinschliff (nur Präsentation):

- `Toolbar.tsx`: kompaktere einzeilige Leiste, dezentere Trenner/Akzente.
- `ThumbnailRail.tsx`: ruhigere Seitennummern, dünnere Linien.
- `DropZone.tsx`: minimalistisch – Feature-Kacheln entfernen, reduzierter Upload-Bereich.
- `PageView.tsx`: leichtere Schatten um die Seiten.
- `GridOverview.tsx`: engere, ruhigere Kacheln.

`i18n.tsx`: neue DE/EN-Keys für Redact-Hint (Textauswahl), Kommentar-Panel (Titel, Filter offen/erledigt/alle, springe zu), FontPicker (Bold/Italic/Familie) und Font-Einbettungs-Warnung.

---

## Technischer Abriss (Dateien)

Neu: `src/components/editor/FontPicker.tsx`, `src/components/editor/CommentsPanel.tsx`, `src/lib/pdf/fontCache.ts`.

Geändert: `src/components/editor/PageView.tsx`, `Toolbar.tsx`, `PdfStudio.tsx`, `ThumbnailRail.tsx`, `DropZone.tsx`, `GridOverview.tsx`, `src/store/editorStore.ts`, `src/lib/pdf/fontDetect.ts`, `src/lib/pdf/export.ts`, `src/lib/i18n.tsx`, `src/styles.css`.

Keine neuen npm-Abhängigkeiten nötig (Cache API ist nativ).

## Verifikation

- Typecheck/Build muss sauber sein.
- Smoke-Test im Preview: PDF laden, Text markieren → schwärzen, Text bearbeiten (FontPicker), Kommentar setzen + erneut anklicken (öffnet Popup, kein neuer Pin), Panel öffnen, Hell/Dunkel umschalten.

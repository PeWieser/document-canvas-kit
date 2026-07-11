# Implementierungsplan – PDF Studio (Web-First, Lovable + Cloudflare kompatibel)

## Ziel

PDF Studio wird direkt auf dem bestehenden Stack (TanStack Start + Cloudflare + Lovable) stabilisiert und verbessert. Alle Änderungen finden **ausschließlich** innerhalb der Anwendungslogik statt – die Build-Pipeline, das Deployment und die Lovable-Integration bleiben vollständig unberührt.

---

## Kompatibilitätsgarantie

> [!CAUTION]
> **Folgende Dateien werden NICHT verändert** – sie steuern Lovable, den SSR-Build und das Cloudflare-Deployment:
>
> | Datei | Grund |
> |---|---|
> | `vite.config.ts` | Lovable-eigene Konfiguration (`@lovable.dev/vite-tanstack-config`), beinhaltet Nitro/Cloudflare-Target |
> | `server.ts` | SSR-Entry-Point für Cloudflare Workers |
> | `start.ts` | TanStack Start Middleware |
> | `router.tsx` | Router-Initialisierung |
> | `routeTree.gen.ts` | Auto-generiert |
> | `routes/__root.tsx` | Root-Shell mit `<HeadContent>`, `<Scripts>`, SEO-Meta |
> | `routes/index.tsx` | Route-Definition (dynamischer Import von PdfStudio) |
> | `.lovable/` | Lovable Projekt-Konfiguration |
> | `package.json` (scripts) | Build-Scripts bleiben unverändert |
> | `components.json` | shadcn/ui Konfiguration |
>
> **Alle Änderungen finden nur in diesen Bereichen statt:**
> - `src/components/editor/*.tsx` (Editor-Komponenten)
> - `src/lib/pdf/*.ts` (PDF-Kernlogik)
> - `src/store/editorStore.ts` (Zustand)
> - `src/styles.css` (Styling)
> - Neue Dateien in den obigen Verzeichnissen

> [!NOTE]
> **Neue npm-Abhängigkeiten** werden nur hinzugefügt, wenn sie rein clientseitig laufen und keinerlei SSR/Node-spezifische APIs voraussetzen. Lovable kann neue `dependencies` in `package.json` problemlos verarbeiten, sofern sie Browser-kompatibel sind.

---

## Phasen-Übersicht

```
Phase 1: Bug Fixes (Schwärzen, Kommentare, Schrifterkennung)
Phase 2: Font Caching im Browser (Offline-Betrieb via Cache API)
Phase 3: Design Overhaul (Swiss/Apple/Notion, Hell/Dunkel)
Phase 4: Automatisierte Tests (Vitest Unit + Playwright E2E)
Phase 5: Portierung zur Desktop-App (Tauri – separater Schritt)
```

---

## Phase 1 – Bug Fixes

### 1.1 Schwärzen per Textauswahl (Redact)

**Problem**: Nutzer zeichnet ein Rechteck – ungenau, Text-Positionen werden oft nicht korrekt getroffen.

**Lösung**: Drei gleichwertige Wege zum Schwärzen (alle im bestehenden Textlayer):

#### [MODIFY] [PageView.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/PageView.tsx)

1. **Werkzeug-Modus** (`tool === "redact"`):
   - Textlayer erhält `pointer-events: auto` + `user-select: text` + Cursor `text`
   - `onMouseUp` liest `window.getSelection()` → konvertiert jede ClientRect via `pdfPoint()` in PDF-Koordinaten → erzeugt `RedactAnno` pro Textfragment
   - Logik analog zur bestehenden [Highlight-Textauswahl](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/PageView.tsx#L298-L318)

2. **Toolbar-Button**: Bei bestehender Textauswahl (beliebiges Werkzeug): Redact-Button in der Toolbar klicken → schwärzt die aktuelle Selektion

3. **Kontextmenü** (Rechtsklick):
   - Bestehender Eintrag `ctxRedact` wird angepasst: liest `window.getSelection()` aus statt nur einen Fixpunkt zu schwärzen
   - Falls Selektion leer: schwärzt ein Bild unter dem Mauszeiger (bestehende `imageRectAt`-Logik bleibt)

#### [MODIFY] [Toolbar.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/Toolbar.tsx)

- Tooltip des Redact-Werkzeugs zeigt neuen Hinweis: „Text auswählen → wird geschwärzt"

---

### 1.2 Schrifterkennung & Font-Werkzeuge

**Problem**: PostScript-Fontnamen (z. B. `ABCDEF+TimesNewRomanPS-BoldMT`) werden nicht immer korrekt aufgelöst. Es fehlt ein Menü zur manuellen Font-Auswahl.

#### [MODIFY] [fontDetect.ts](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/lib/pdf/fontDetect.ts)

- Erweiterte `psNameMap` für häufige Schriften (Calibri, Cambria, Verdana, Georgia, Trebuchet MS, Tahoma, Consolas)
- Robusteres Subset-Prefix-Stripping: Regex `^[A-Z]{6}\+` statt nur `indexOf("+")`
- CID-Font-Fallback: Wenn der Name rein numerisch/unbekannt ist → Helvetica mit Console-Warning

#### [NEW] `src/components/editor/FontPicker.tsx`

Kompaktes Schriftauswahl-Menü (Word/Pages/Notion-Stil):

```
┌──────────────────────────────┐
│  Arial          ▾  │ 14 │ B │ I │ 🎨 │
└──────────────────────────────┘
```

- Zeigt die erkannte Schriftart der aktuell selektierten Annotation
- Dropdown mit häufigen Schriftarten + bisher in diesem Dokument verwendeten
- Schriftgrößen-Eingabe (numerisch)
- Bold/Italic Toggle-Buttons
- Farbwähler (bestehende SwatchRow wiederverwendet)
- Änderungen rufen `updateAnnotation(id, { fontFamily, bold, italic, fontSize, color })` auf

#### [MODIFY] [Toolbar.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/Toolbar.tsx)

- `FontPicker` wird eingeblendet, wenn `tool === "edit-text"` oder `tool === "textbox"` und eine Annotation ausgewählt ist

#### [MODIFY] [export.ts](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/lib/pdf/export.ts)

- `makeFontResolver` nutzt zuerst den Browser-Font-Cache (Phase 2), dann Netzwerk, dann Helvetica-Fallback
- Saubere Fehlerbehandlung: Bei fehlgeschlagener Einbettung → Toast-Warnung an Nutzer, kein stiller Fehler

---

### 1.3 Kommentare

**Problem**: Klick auf bestehenden Pin → neuer Kommentar wird erstellt statt Popup zu öffnen. Keine Übersicht über alle Kommentare.

#### [MODIFY] [PageView.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/PageView.tsx)

In `onOverlayPointerDown`, Block `tool === "comment"`:

```typescript
// NEU: Prüfe ob Klick nahe an bestehendem Comment-Pin ist
if (tool === "comment") {
  const [px, py] = pdfPoint(sx, sy, vp);
  const existing = pageAnnos.find(
    a => a.kind === "comment" &&
    Math.hypot(a.x - px, a.y - py) < 20 / zoom  // 20 PDF-Punkte Radius
  );
  if (existing) {
    select(existing.id);  // Öffnet das Popup durch Selection
    return;
  }
  // Kein bestehender → neuen Pin erstellen (wie bisher)
  addAnnotation({ ... });
}
```

#### [NEW] `src/components/editor/CommentsPanel.tsx`

Rechte Seitenleiste für Kommentar-Übersicht:
- Auflistung aller Kommentare, gruppiert nach Seite
- Status-Badge: ● grün (resolved) / ○ grau (open)
- Klick → springt zur Seite und selektiert den Kommentar
- Antwort-Thread inline ausklappbar
- Suchfilter (optional): offen/gelöst/alle

#### [MODIFY] [editorStore.ts](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/store/editorStore.ts)

- Neuer State: `commentsPanelOpen: boolean` (default: `false`)
- Neue Action: `toggleCommentsPanel()`

#### [MODIFY] [PdfStudio.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/PdfStudio.tsx)

- `CommentsPanel` wird rechts neben dem Hauptbereich gerendert, wenn `commentsPanelOpen === true`

#### [MODIFY] [Toolbar.tsx](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/components/editor/Toolbar.tsx)

- Toggle-Button für das Kommentar-Panel (rechte Seite der Toolbar)

#### [MODIFY] [export.ts](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/lib/pdf/export.ts)

- Kommentar-Replies als separate verknüpfte Annotationen im PDF (`IRT` = In Reply To Reference)
- `resolved` → PDF-Standard `AS: /Completed`

---

## Phase 2 – Font Caching im Browser (Offline-First)

#### [NEW] `src/lib/pdf/fontCache.ts`

```typescript
// Caching-Layer über die Cache Storage API des Browsers
const CACHE_NAME = "pdfstudio-fonts-v1";

export async function getCachedFont(key: string): Promise<ArrayBuffer | null> {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(key);
  return response ? response.arrayBuffer() : null;
}

export async function setCachedFont(key: string, data: ArrayBuffer): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(key, new Response(data));
}
```

#### [MODIFY] [fontDetect.ts](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/lib/pdf/fontDetect.ts)

- `getFontBytes()` prüft zuerst `getCachedFont()`, dann Netzwerk, dann speichert via `setCachedFont()`
- `loadWebFont()` nutzt gleichen Cache für die CSS-Stylesheet-Links

---

## Phase 3 – Design Overhaul

Ziel: Cleanes, funktionales Design – hell & dunkel. Notion-/Apple-Ästhetik. Nur sichtbar, was gebraucht wird.

#### [MODIFY] [styles.css](file:///d:/code%20gemini/document-canvas-kit-main/document-canvas-kit-main/src/styles.css)

Vollständige Überarbeitung der CSS Custom Properties:

**Heller Modus**:
- Warmes Weiß (`#fafaf9`), steingraue Ränder (`#e7e5e4`), dezente Schatten
- Toolbar/Sidebar: `#f5f5f4` – kaum von der Seite unterscheidbar, kein starker Kontrast
- Akzentfarbe: Blau `#2563eb`

**Dunkler Modus** (`.dark`):
- Schiefergrau (`#1c1917`), warme Kontraste
- Dokument-Canvas bleibt weiß (PDF wird immer hell dargestellt)

**Typografie**: System-Font-Stack für die UI selbst:
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```

#### [MODIFY] Alle Editor-Komponenten

- `Toolbar.tsx`: Kompakte einzeilige Leiste, Icons-only mit Tooltips, kontextuelle Werkzeugoptionen inline
- `ThumbnailRail.tsx`: Schmaler (140px), dezentere Seitennummern
- `DropZone.tsx`: Minimalistischer Upload-Bereich ohne Feature-Kacheln
- `PageView.tsx`: Leichtere Schatten um die Seiten
- `GridOverview.tsx`: Engere Kacheln, ruhigeres Erscheinungsbild

---

## Phase 4 – Automatisierte Tests

### 4.1 Vitest (Unit-Tests)

#### [NEW] `src/__tests__/pdf/ContentStreamEditor.test.ts`
- Tokenizer: Bekannter Byte-Stream → korrekte Token-Typen
- Redact-Filter: Zeichen in Box → entfernt, Zeichen außerhalb → bleibt

#### [NEW] `src/__tests__/pdf/export.test.ts`
- Minimal-PDF + Highlight → exportiertes PDF enthält Highlight-Rect
- Redact → geschwärzter Text fehlt im exportierten Stream

#### [NEW] `src/__tests__/pdf/fontDetect.test.ts`
- `"ABCDEF+Arial-BoldMT"` → `{ family: "Arial", isBold: true, isItalic: false }`
- Unbekannter Name → Helvetica-Fallback

#### [NEW] `src/__tests__/store/editorStore.test.ts`
- Annotations hinzufügen, updaten, entfernen
- 3x Undo → leerer Zustand; 3x Redo → alle 3 Annotations zurück
- `reorderPages` / `deletePage` korrekt

### 4.2 Playwright (E2E-Tests)

#### [NEW] `e2e/fixtures/sample.pdf`
Test-PDF mit bekanntem Text („Geheime Information", „Öffentlicher Text"), einem Bild und verschiedenen Schriften.

#### [NEW] `e2e/tests/`

| Test | Prüft |
|---|---|
| `open-file.spec.ts` | PDF-Upload via Drop-Zone → Seiten werden gerendert |
| `redact.spec.ts` | Text auswählen → Schwärzen → Export → Text physisch entfernt |
| `highlight.spec.ts` | Text markieren → Export → Highlight-Rect im PDF |
| `comment.spec.ts` | Pin setzen → Klick öffnet Popup (kein neuer Pin!) → Antwort hinzufügen |
| `edit-text.spec.ts` | Text anklicken → ersetzen → Export → neuer Text im PDF |
| `undo-redo.spec.ts` | Annotation → Strg+Z → weg → Strg+Y → zurück |
| `save-export.spec.ts` | Export → heruntergeladene Datei ist valides PDF |

---

## Phase 5 – Portierung zur Desktop-App (Tauri)

> [!NOTE]
> Diese Phase wird **separat** und **erst nach Abschluss aller obigen Phasen** umgesetzt. Sie erfordert eine Framework-Umstellung (TanStack Start → reine Vite SPA) und ist nicht Lovable/Cloudflare-kompatibel. Der Web-Branch bleibt parallel bestehen.

Inhalte dieser Phase (zusammengefasst):
1. Neuer Git-Branch `desktop`
2. `vite.config.ts` durch Standard-Vite-Config ersetzen (nur auf diesem Branch)
3. TanStack Start SSR-Server entfernen → Client-only SPA
4. Tauri v2 Rust-Crate initialisieren (`src-tauri/`)
5. Native Dateidialoge über Tauri-Commands
6. Font-Cache von Browser Cache API auf Tauri App-Datenverzeichnis umstellen
7. Tauri-Builds für Windows, macOS, Linux konfigurieren

---

## Reihenfolge der Umsetzung

```
1. [ ] Redact via Textauswahl (PageView.tsx, Toolbar.tsx)
2. [ ] Schrifterkennung Fix + FontPicker Komponente
3. [ ] Kommentar-Pin Fix + CommentsPanel
4. [ ] Font Cache (fontCache.ts, fontDetect.ts Anpassung)
5. [ ] Design Overhaul (styles.css + alle Editor-Komponenten)
6. [ ] Vitest Unit-Tests einrichten
7. [ ] Playwright E2E-Tests einrichten
8. [ ] (Separat) Tauri Desktop-Portierung
```

---

## Verifikationsplan

### Automatisiert
- `npx vitest run` – Unit-Tests für PDF-Kernlogik und Store
- `npx playwright test` – E2E-Tests im Browser (Workflow: Laden → Bearbeiten → Schwärzen → Exportieren → Validieren)

### Manuell
- PDF mit Umlauten, Bildern und verschiedenen Schriften bearbeiten und exportieren
- Export-PDF in Adobe Acrobat / Firefox / Chrome öffnen: Schwärzung korrekt? Kommentare sichtbar?
- Internetverbindung trennen → bereits gecachte Fonts weiterhin verfügbar?
- Hell/Dunkel-Modus wechseln
- Auf Lovable pushen → Build/Deploy auf Cloudflare funktioniert ohne Änderungen ✓

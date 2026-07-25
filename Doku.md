# Technische Projektdokumentation – PDF Studio (Web-First)

Diese Dokumentation dient zukünftigen KIs und Entwicklern als Leitfaden und Übergabeprotokoll für die Weiterentwicklung von PDF Studio.

---

## 1. Technologiestack & Infrastruktur

> [!IMPORTANT]
> **Lovable & Cloudflare-Kompatibilität**:
> Die Build- und Deployment-Infrastruktur darf **nicht verändert** werden, da sie von Lovable gesteuert wird und direkt nach Cloudflare deployt.
>
> Verändere **niemals** folgende Dateien:
>
> - `vite.config.ts` (verwendet `@lovable.dev/vite-tanstack-config` mit integrierten Nitro- und SSR-Plugins)
> - `server.ts` & `start.ts` (SSR / Edge-Worker Routing)
> - `router.tsx` & `routeTree.gen.ts` (TanStack Router Steuerung)
> - `.lovable/` (Lovable Konfigurationsordner)
> - Vorhandene Scripts in `package.json`

### Kern-Bibliotheken

- **Framework**: React 19 + TanStack Start (SSR)
- **Zustand**: Zustand v5 (`src/store/editorStore.ts` & `src/store/documentStore.ts`)
- **Styling**: TailwindCSS v4 + Vanilla CSS (`src/styles.css`)
- **PDF-Rendering**: PDF.js (`pdfjs-dist`) via WebWorker
- **PDF-Manipulation**: `pdf-lib` + `@pdf-lib/fontkit` (für Schrifteinbettung)

---

## 2. Kern-Architektur

### 2.1 PDF-Rendering & Text-Koordinaten

- Das Dokument wird in `src/components/editor/PageView.tsx` gerendert.
- Ein `<canvas>` rendert die visuelle Seite.
- Ein transparenter HTML-Textlayer (`pdf-text-layer`) wird deckungsgleich darübergelegt, um native Textauswahl (Selektion) und Hover-Effekte zu ermöglichen.
- **Koordinaten-System**: PDF-Punkte haben ihren Nullpunkt links unten, y-Achse zeigt nach oben. Der Browser nutzt links oben als Nullpunkt, y-Achse zeigt nach unten. Die Hilfsfunktionen in `src/lib/pdf/screen.ts` übernehmen diese Umrechnung (`pdfPoint`, `screenRect`).

### 2.2 Echte Schwärzung (Redaction-Algorithmus)

In `src/lib/pdf/ContentStreamEditor.ts` befindet sich der Tokenizer, der den PDF-Byte-Inhaltsstrom parst.

- Beim Export (`export.ts`) sucht der Editor nach Textzeichen, die innerhalb der Schwärzungs-Rechtecke liegen.
- Die betroffenen Text-Operatoren (z. B. `TJ`, `Tj`, `Do`) werden aus dem ContentStream herausgefiltert und gelöscht.
- **Wichtig**: Der Text wird nicht bloß visuell mit einem schwarzen Kasten übermalt, sondern **physisch** aus den PDF-Bytes entfernt, um Auslesen oder Copy-Paste von geschwärzten Daten zu verhindern.

### 2.3 Atomares Font-Erkennungs- und Matching-System

- **Deterministische Offline-KNN-Fonterkennung**: Das System verwendet einen clientseitigen WebWorker, um unbekannte oder fehlerhaft benannte Subset-Schriften (z. B. `ABCDEF+TimesNewRoman`) zu identifizieren. Es vergleicht extrahierte Glyphen-Vektordaten und Zeichenbreiten mit einer lokalen SQLite-Datenbank (`public/font-fingerprints.db.gz`), die komprimierte Fingerabdrücke aller 1.950+ Google/Bunny-Fonts enthält:
  - **Atomarer Einzel-Ablauf**: In `PageView.tsx` (`replaceSpan()`) werden Font-Header-Descriptor und KNN-Vektor-Matcher in einer atomaren Sequenz zusammengefasst. Die Annotation wird erst dann im UI aktualisiert, wenn der KNN-Matcher das finale beste Ergebnis (z.B. `"Futura Bk BT"`) berechnet hat, um zweifache Namenswechsel ("Futura BT" $\rightarrow$ "Futura Bk BT") zu verhindern.
  - **Filterung**: Auswahl durch Zeichen-Topologie (Anzahl geschlossener Löcher) und Hu-Moments (L2-Abstand).
  - **Metrischer Vergleich**: Mean Absolute Error (MAE) der Zeichenbreiten normiert auf 1000 UPEM.
  - **Validierung**: IoU-Check der Rastermasken für Schlüsselzeichen.
  - **Helvetica-Klick-Fallback behoben**: Beim erstmaligen Erkennen einer Schriftart durch den KNN-Matcher wird der korrigierte Font-Name direkt in `fontInfoRef.current` gecached.
- **Farben- und Style-Erhalt**: In `PageView.tsx` wird die originale Textfarbe aus den PDF-Bytes ausgelesen (`item.color`) und als Hexcode dem Eingabefeld zugewiesen. Die Formatierungen Fett (`bold`) und Kursiv (`italic`) sowie der erkannte Schriftname werden vom KNN-Matcher übernommen.
- **Manuelle Font-Auswahl**: Alle 1.950+ Bunny-Schriftarten stehen dem Anwender in `FontPicker.tsx` zur manuellen Auswahl zur Verfügung.

### 2.4 Buchstaben-Mitten-Ausrichtung & Subpixel-GPU-Engine (`alignmentEngine.ts`)

- **Buchstaben-Mitten-Ausrichtung (Letter Center Alignment)**:
  Zur Erreichung von $0.000\text{px}$ vertikaler Grundlinien- und Mitten-Deckungsgleichheit misst das System in Echtzeit per 2D Canvas `ctx.measureText(str)` den vertikalen Mittelpunkt der echten Buchstaben-Pixel (`actualBoundingBoxAscent`/`Descent`):
  $$\text{glyphCenterY} = tx[5] - \frac{\text{actualBoundingBoxAscent} - \text{actualBoundingBoxDescent}}{2}$$
  $$\text{domTop} = \text{glyphCenterY} - \frac{\text{fontHeight}}{2}$$
  Dies platziert den vertikalen Mittelpunkt des DOM-Textfeldes **exakt über dem vertikalen Mittelpunkt der PDF-Buchstaben**.
- **Subpixel-GPU-Positionierung (`translate3d`)**:
  In `PageView.tsx` (`AnnoView`) werden Text-Container mit `transform: translate3d(leftPx, topPx, 0px)` positioniert. `translate3d` nutzt die Grafikkarte für Fließkomma-Positionierung und verhindert das Einrasten auf ganze Gerät-Pixel bei allen Zoomstufen (100%, 125%, 150%, 200%).
- **Subpixel-Abdeckmaskierung**:
  Das weiße Abdeckfeld wird um `top: -0.75px` und `height: calc(100% + 1.5px)` erweitert, wodurch 100% aller grauen Antialiasing-Subpixel-Kanten des darunterliegenden Original-Textes abgedeckt werden.
- **CSS Font Smoothing**:
  Textfelder nutzen `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;`, um die Strichstärke exakt an das 2D-Canvas-Rendering von PDF.js anzupassen.

### 2.5 Multi-Dokument Tab-System & InDesign UI-Komponenten

- **VS Code Tab-Leiste**: Das Multi-Dokument-System (`documentStore.ts`) rendert Tabs direkt unterhalb der `Toolbar` in der Farbe der Werkzeugleiste (`bg-card`). Aktive Tabs sind mit einer oberen Akzentlinie (`border-t-2 border-t-primary`) gekennzeichnet. Bei leerer Landing-Page ist die Tab-Leiste ausgeblendet.
- **InDesign-Style Anfasser**: Textfelder und Selektionsboxen nutzen feine 6px-Anfasser (`w-2 h-2 rounded-[1px] bg-white border border-primary shadow-2xs z-30`) ohne störende Innen-Icons.
- **Höhenskalierung von Textfeldern**: Textfelder lassen sich flexibel über alle 8 handles in Breite und Höhe (`h`) skalieren. Neue Textfelder starten mit einem leeren Eingabefeld (`text: ""`).
- **Einrastfunktion (Magnet-Toggle)**: Ein Magnet-Icon in der Toolbar steuert `snapToGuides: boolean` im Store, um magnetische Ausrichtungslinien beim Verschieben von Textfeldern und Vektoren ein- und auszuschalten.

### 2.6 Universeller Farbwähler mit Pipette (`ColorPickerWithEyedropper.tsx`)

- Bietet vorgefertigte Farb-Paletten, ein natives HTML `<input type="color">`-Eingabefeld und ein Pipetten-Tool (`window.EyeDropper`), mit dem jede beliebige Farbe vom Bildschirm aufgenommen werden kann.
- Integriert in Toolbar (Stift- und Textmarkerfarben), Font-Toolbar (Textfarbe) und Properties-Panel (Vektor-Strich- und Füllfarbe).

### 2.7 Fixierte Architektur- & Layout-Regeln (Locked Rules)

> [!IMPORTANT]
> **Zwingend einzuhaltende System-Regeln**:
>
> 1. **Header Layout & Komponenten-Hierarchie**:
>    - Vertikaler Aufbau: `Toolbar` (oben, `z-[100]`) -> `TabBar` (direkt darunter, `z-[150]`) -> Canvas Workspace.
>    - `StatusBar` ist dauerhaft entfernt (permanently removed).
>
> 2. **Off-screen Canvas Rendering**:
>    - Muss einen sauberen `document.createElement("canvas")`-Puffer ohne `globalCanvasPool`-Eviction verwenden.
>    - Dies verhindert VRAM-Speicherlecks, Zoom-Lag sowie weiße/leere Seiten beim Rendern.
>
> 3. **Subpixel Alignment Formel**:
>    - Exakte Ausrichtungsformel für DOM-Textschichten (`alignmentEngine.ts`): $\text{glyphCenterY} = tx[5] - \frac{\text{ascent} - \text{descent}}{2}$, $\text{domTop} = \text{glyphCenterY} - \frac{\text{fontHeight}}{2}$, `lineHeight: 1`, `padding: 0`, `margin: 0`, `whiteSpace: "pre"`.
>    - Garantiert 0.000px vertikale Abweichung gegenüber den PDF.js Textlayer-Spans across multi-zoom scales.
>
> 4. **Non-Blocking Tooltips & Z-Index Layering**:
>    - Tooltips (`src/components/ui/tooltip.tsx`) nutzen `side="bottom"`, `sideOffset={8}`, `pointer-events-none select-none` bei `z-[300]`.
>    - Tooltips ploppen UNTERhalb der Toolbar-Buttons auf und fangen NIEMALS Klicks auf benachbarte Werkzeug-Buttons ab.

---

## 3. Zustand & Undo/Redo

Der Zustand der Anwendung wird in `src/store/editorStore.ts` und `src/store/documentStore.ts` gehalten.

- **Annotationen**: Alle Änderungen (Highlights, Schwärzungen, Textboxen, Freihandzeichnungen, Kommentare) liegen im Array `annotations`.
- **Einrast-Zustand**: `snapToGuides: boolean` steuert das Magnet-Ausrichtungsnetz.
- **Undo/Redo**: Bei jeder zustandsverändernden Operation wird ein Snapshot des aktuellen Stands in das `past`-Array geschoben.
- **Optimierte Historie bei Drag & Resize**: Beim Klick-Start (`onPointerDown`) wird über `pushHistorySnapshot` genau ein einzelner Snapshot erzeugt. Während der Bewegung werden die Koordinaten geräuschlos (`commitToHistory = false`) aktualisiert.

---

## 4. Kommentar-System (`CommentsPanel.tsx`)

- Jedes Kommentar-Element (`CommentAnno`) besitzt Koordinaten, Text, Replies und einen Status (`resolved: boolean`).
- **Sidebar-Filterung**: Erkannter PDF-Originaltext (`textReplace`) wird explizit aus der Kommentar-Sidebar herausgefiltert.
- **Multitype-Unterstützung**: Stift-Zeichnungen (`ink`), Textmarker (`highlight`), Notizen, Unterstreichungen und Schwärzungskommentare mit Text/Replies werden in der Liste aufgeführt.
- **Klick-Priorisierung**: Der Button des Kommentar-Pins ruft `e.stopPropagation()` in `onPointerDown` auf, um ungewolltes Platzieren neuer Annotationen zu verhindern.

---

## 5. UI/UX & Mobile Responsiveness

- **Farbpalette**: Warme Grautöne, edle Akzente, Light Mode mit `bg-card` Toolbar-Farbe und oberer Primär-Akzentlinie.
- **Dark Mode**: Reagiert auf die CSS-Klasse `.dark` im `html`-Element. Das Dokument-Canvas selbst bleibt immer weiß.
- **Non-Blocking Tooltips**: Tooltips befinden sich auf Layer `z-[300]`, ploppen unterhalb auf (`side="bottom"`) und lassen alle Mausklicks durch.

### 5.1 Mobile Responsive Strategie (`< 768px`)

- **Slide-Over Drawers**: `ThumbnailRail` (Seitenleiste) und `CommentsPanel` öffnen sich auf Mobile als fixed Overlays (`z-50`) mit einem halbtransparenten Backdrop (`bg-black/40`).
- **Mobile Werkzeugleiste**: Suche & Schwärzen ist im mobilen Kompakt-Menü (`⋮`) erreichbar. Die Sub-Toolbar scrollt touch-freundlich horizontal (`.subtoolbar-scroll`).
- **Pinch-to-Zoom & Long-Press**: 2-Finger Touch Pinch-to-Zoom auf dem Canvas. 1-Sekunde Long-Press mit haptischem Feedback (`vibrate`) schaltet Touch-Drag-and-Drop frei.

---

## 6. Automatisierte Tests

Das Projekt verfügt über eine umfassende Vitest- & Playwright-Testsuite:

### Tests ausführen:

- **Alle Vitest-Tests ausführen**: `npm test`
- **Watch-Modus**: `npm run test:watch`
- **Test-UI im Browser**: `npm run test:ui`
- **Playwright E2E-Tests**: `npx playwright test`

### Test-Struktur:

1. `src/__tests__/pdf/fontDetect.test.ts`: Validiert Font-Erkennung und Style-Zuweisung.
2. `src/__tests__/pdf/paragraphGroup.test.ts`: Testet die Paragrafen- und Zeilenerkennungs-Engine.
3. `src/__tests__/pdf/strictWordMerging.test.ts`: Testet striktes Same-Font Word Merging.
4. `src/__tests__/ui/CommentsPanel.test.tsx`: Validiert Kommentar-Sidebar-Filterung.
5. `e2e/pixelAlignment.spec.ts`: Playwright E2E Multi-Zoom Subpixel Alignment & Tooltip Verification ($\le 0.007\text{px}$ Drift).



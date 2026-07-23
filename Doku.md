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
- **Zustand**: Zustand v5 (`src/store/editorStore.ts`)
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

### 2.3 Font-Erkennungs- und Fallback-System

- Wenn ein Text geändert wird (`textReplace`), muss die Schriftart im PDF eingebettet werden.
- **Deterministische Offline-KNN-Fonterkennung**: Das System verwendet einen clientseitigen WebWorker, um unbekannte oder fehlerhaft benannte Subset-Schriften (z. B. `ABCDEF+TimesNewRoman`) zu identifizieren. Es vergleicht extrahierte Glyphen-Vektordaten und Zeichenbreiten mit einer lokalen SQLite-Datenbank (`public/font-fingerprints.db.gz`), die komprimierte Fingerabdrücke aller 1.950+ Google/Bunny-Fonts enthält:
  - **Filterung**: Auswahl durch Zeichen-Topologie (Anzahl geschlossener Löcher) und Hu-Moments (L2-Abstand).
  - **Metrischer Vergleich**: Mean Absolute Error (MAE) der Zeichenbreiten normiert auf 1000 UPEM.
  - **Validierung**: IoU-Check der Rastermasken für Schlüsselzeichen.
  - **Lade-UI & Fortschrittsanzeige**: Wechselt der Nutzer in den Modus „Text bearbeiten“ und die SQLite-Datenbank lädt noch, blockiert ein bildschirmfüllendes Overlay weitere Interaktionen. Bei einer Ladedauer von unter 1 Sekunde wird ein rotierender Spinner eingeblendet; dauert es länger, wird automatisch ein animierter Fortschrittsbalken gerendert.
  - **Worker-Readiness & Synchronisation**: Der WebWorker signalisiert seine Einsatzbereitschaft proaktiv mit einem `READY`-Event nach dem Entpacken der DB im RAM. Der Matching-Prozess wartet auf dieses Signal, um Race Conditions und fehlerhafte Rückgabetypen (`Unknown`) zu verhindern.
  - **Filter für Subset-Namen (`isGarbageFontName`)**: Asynchrone Metadaten (z. B. aus `getFontInfo`) werden auf ungültige Subset-Schriftnamen (z. B. `TTF4t00` oder `g_d0_f1`) geprüft. Solche Werte werden verworfen, um ein Zurücksetzen bereits erkannter Fonts auf Helvetica zu unterbinden.
  - **Nachträgliches Font-Update**: Nach erfolgreicher Ermittlung des KNN-Mappings werden bereits erstellte Annotationen auf der Seite, die noch mit dem Standard-Fallback (Helvetica) initialisiert wurden, im Hintergrund automatisch auf die korrekte Schriftart aktualisiert.
  - **Helvetica-Klick-Fallback behoben**: Beim erstmaligen Erkennen einer Schriftart durch den KNN-Matcher wird der korrigierte Font-Name direkt in `fontInfoRef.current` gecached. Dies verhindert, dass darauffolgende Klicks auf denselben Textabschnitt die Metadaten mit dem Subset-Namen überschreiben und Helvetica erzwingen.
- **Farben- und Style-Erhalt**: In `PageView.tsx` wird die originale Textfarbe aus den PDF-Bytes ausgelesen (`item.color`) und als Hexcode dem Eingabefeld zugewiesen. Die Formatierungen Fett (`bold`) und Kursiv (`italic`) sowie der erkannte Schriftname werden vom KNN-Matcher übernommen, anstatt von leeren Subset-Metadaten (z. B. `TTF4t00`) überschrieben zu werden.
- **Manuelle Font-Auswahl**: Alle 1.950+ Bunny-Schriftarten stehen dem Anwender in `FontPicker.tsx` (geladen aus `src/lib/pdf/font-families.json`) zur manuellen Auswahl zur Verfügung und werden bei Aktivierung on-the-fly geladen.
- Fällt die Erkennung oder das Laden fehl, wird ein sicherer Fallback auf **Helvetica** angewendet.

### 2.4 Intelligente Paragrafen- & Zeilenerkennungs-Engine (`src/lib/pdf/paragraphGroup.ts`)

- **Automatische Block-Erkennung**: `detectParagraphs(rawItems)` gruppiert zusammengehörige PDF-Textzeilen anhand von vertikalen Abständen ($0.7 \times \text{fontSize} \le \Delta Y \le 2.2 \times \text{fontSize}$), Linksbündigkeit und Schriftgrößen-Übereinstimmung zu zusammenhängenden Absätzen.
- **Mehrzeilige Textbearbeitung**: Das Anklicken einer Zeile wählt den gesamten Absatz als zusammenhängende `textReplace`-Annotation mit Zeilenumbrüchen (`\n`) aus.
- **Zeilenbreiten-Messung**: Der Container berechnet die maximale Breite über **alle Zeilen** des Absatzes (`maxMeasured + 14px`), um ungewollten automatischen Zeilenumbruch mitten im Wort zu verhindern (`wordBreak: "keep-all"`).
- **Formatierungs-Erhalt**: Prüft alle Zeilen im Absatz auf `bold`/`italic`-Flags, damit fette Überschriften (z. B. `"Absender:"`) korrekt im Eingabefeld erhalten bleiben.
- **Einstellbarer Zeilenabstand**: `FontPicker.tsx` bietet einen expliziten Zeilenabstands-Wähler (`1.0` bis `2.0`). Der Abstand wird automatisch erkannt und sowohl im DOM als auch beim PDF-Export angewendet.

### 2.5 Fixierte Architektur- & Layout-Regeln (Locked Rules)

> [!IMPORTANT]
> **Zwingend einzuhaltende System-Regeln**:
>
> 1. **Header Layout & Komponenten-Hierarchie**:
>    - Vertikaler Aufbau: `Toolbar` (oben) -> `TabBar` (direkt darunter) -> Canvas Workspace.
>    - `StatusBar` ist dauerhaft entfernt (permanently removed).
>
> 2. **Off-screen Canvas Rendering**:
>    - Muss einen sauberen `document.createElement("canvas")`-Puffer ohne `globalCanvasPool`-Eviction verwenden.
>    - Dies verhindert VRAM-Speicherlecks, Zoom-Lag sowie weiße/leere Seiten beim Rendern.
>
> 3. **Subpixel Alignment Formel**:
>    - Exakte Ausrichtungsformel für DOM-Textschichten (`alignmentEngine.ts`): `domTop = tx[5] - fontHeight`, `domLeft = tx[4]`, `lineHeight: 1`, `padding: 0`, `margin: 0`, `whiteSpace: "pre"`.
>    - Garantiert 0.00px vertikale Abweichung gegenüber den PDF.js Textlayer-Spans.

### 2.6 1:1 Vertikale Ausrichtung & Scrollbar-Unterdrückung im Viewport

- **Deckungsgleiche Grundlinie**: `<textarea>`-Elemente und Ausrichtungsberechnungen in `src/lib/pdf/alignmentEngine.ts` nutzen die Subpixel Alignment Formel (`domTop = tx[5] - fontHeight`, `domLeft = tx[4]`, `lineHeight: 1`, `padding: 0`, `margin: 0`, `whiteSpace: "pre"` und `transform-origin: 0 0`), um eine 0.00px vertikale Abweichung gegenüber den PDF.js-Textspans zu erreichen.
- **Scrollbar-Eliminierung**: Globale CSS-Regeln in `src/styles.css` (`scrollbar-width: none !important`, `::-webkit-scrollbar { display: none !important }`) unterdrücken native Browser-Scrollbalken in Textboxen vollständig.

### 2.7 Feedback-System & Cloudflare D1 Integration (`FeedbackWidget.tsx`)

- **Schwebendes Widget**: Unten rechts befindet sich ein Button zum Öffnen des Feedback-Dialogs (Kategorien: Wunsch, Kritik, Bug, UI-Verbesserung).
- **Cloudflare D1 Worker**: Sendet Feedbacks an ein Cloudflare-Backend (`https://feedback-pdf.semole.workers.dev/`).
- **Konami-Code Admin-Modus**: Das Eingeben des Konami-Codes (`↑ ↑ ↓ ↓ ← → ← → B A`) im Modal schaltet den Admin-Modus frei (Anzeigen, Gruppieren und Löschen von Feedback-Einträgen mittels API-Key).

---

## 3. Zustand & Undo/Redo

Der Zustand der Anwendung wird in `src/store/editorStore.ts` gehalten.

- **Annotationen**: Alle Änderungen (Highlights, Schwärzungen, Textboxen, Freihandzeichnungen, Kommentare) liegen im Array `annotations`.
- **Undo/Redo**: Bei jeder zustandsverändernden Operation wird ein Snapshot des aktuellen Stands (`annotations`, `pageOrder`) in das `past`-Array geschoben. Ein Aufruf von `undo()` schiebt den aktuellen Zustand in `future` und stellt den letzten Snapshot aus `past` wieder her.
- **Optimierte Historie bei Drag & Resize**: Um zu verhindern, dass kontinuierliche Mausbewegungen beim Ziehen oder Skalieren hunderte Zwischenzustände in der Historie ablegen, wird beim Klick-Start (`onPointerDown`) über `pushHistorySnapshot` genau ein einzelner Snapshot erzeugt. Während der Bewegung werden die Koordinaten geräuschlos (`commitToHistory = false`) aktualisiert.

---

## 4. Kommentar-System

- Jedes Kommentar-Element (`CommentAnno`) besitzt Koordinaten, Text, Replies und einen Status (`resolved: boolean`).
- **Klick-Priorisierung**: Der Button des Kommentar-Pins ruft `e.stopPropagation()` in `onPointerDown` auf. Dies verhindert, dass das Editor-Overlay den Klick abfängt und an gleicher Stelle fälschlicherweise eine neue Annotation platziert.
- **Replies**: Werden direkt im Popup oder in der Sidebar hinzugefügt. Auf PDF-Ebene werden diese als Annotationen exportiert und miteinander verknüpft.

---

## 5. UI/UX & Mobile Responsiveness

Das Design wird minimalistisch und funktional gehalten:

- **Farbpalette**: Warme Grautöne, minimale Linien, edle Akzente (z. B. Blau als Primärfarbe).
- **Kontextsensitivität**: Einstellungsmenüs (wie der Schriftartenwähler `FontPicker`) werden nur dann eingeblendet, wenn das dazugehörige Werkzeug oder Element selektiert ist.
- **Dark Mode**: Reagiert auf die CSS-Klasse `.dark` im `html`-Element. Das Dokument-Canvas selbst bleibt immer weiß, während sich die Toolbar und Seitenleisten abdunkeln.

### 5.1 Mobile Responsive Strategie (`< 768px`)

- **Slide-Over Drawers**: `ThumbnailRail` (Seitenleiste) und `CommentsPanel` öffnen sich auf Mobile als fixed Overlays (`z-50`) mit einem halbtransparenten Backdrop (`bg-black/40`), ohne das PDF-Canvas einzustauchen. Auf Desktop ($\ge 768\text{px}$) bleiben sie inline.
- **Mobile Werkzeugleiste**: Suche & Schwärzen ist im mobilen Kompakt-Menü (`⋮`) erreichbar. Die Sub-Toolbar scrollt touch-freundlich horizontal (`.subtoolbar-scroll`).
- **Pinch-to-Zoom & Long-Press**: 2-Finger Touch Pinch-to-Zoom auf dem Canvas. 1-Sekunde Long-Press (1000ms Hold) mit haptischem Feedback (`vibrate`) schaltet Touch-Drag-and-Drop im Grid View frei.

---

## 6. Automatisierte Tests

Das Projekt verfügt über eine umfassende Testsuite:

### Tests ausführen:

- **Alle Vitest-Tests ausführen**: `npm test`
- **Watch-Modus**: `npm run test:watch`
- **Test-UI im Browser**: `npm run test:ui`
- **Playwright E2E-Tests**: `npx playwright test`

### Test-Struktur:

1. `src/__tests__/pdf/fontDetect.test.ts`: Validiert Font-Erkennung und Style-Zuweisung.
2. `src/__tests__/pdf/paragraphGroup.test.ts`: Testet die Paragrafen- und Zeilenerkennungs-Engine.
3. `src/__tests__/pdf/generateProof.test.ts`: Generiert automatische Vektor-Deckungsgleichheitsberichte ($\Delta X, \Delta Y = 0.0000\text{pt}$).
4. `src/__tests__/ui/verticalAlignmentDOM.test.tsx`: Prüft mathematische 1:1 DOM-Parität der Textboxen.
5. `e2e/verticalAlignment.spec.ts`: Playwright E2E-Visual & Position Alignment Test.


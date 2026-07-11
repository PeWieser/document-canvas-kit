# Technische Projektdokumentation – PDF Studio (Web-First)

Diese Dokumentation dient zukünftigen KIs und Entwicklern als Leitfaden und Übergabeprotokoll für die Weiterentwicklung von PDF Studio.

---

## 1. Technologiestack & Infrastruktur

> [!IMPORTANT]
> **Lovable & Cloudflare-Kompatibilität**:
> Die Build- und Deployment-Infrastruktur darf **nicht verändert** werden, da sie von Lovable gesteuert wird und direkt nach Cloudflare deployt. 
> 
> Verändere **niemals** folgende Dateien:
> - `vite.config.ts` (verwendet `@lovable.dev/vite-tanstack-config` mit integrierten Nitro- und SSR-Plugins)
> - `server.ts` & `start.ts` (SSR / Edge-Worker Routing)
> - `router.tsx` & `routeTree.gen.ts` (TanStack Router Steuerung)
> - `.lovable/` (Lovable Konfigurationsordner)
> - Vorhandene Scripts in `package.json`

### Kern-Bibliotheken
* **Framework**: React 19 + TanStack Start (SSR)
* **Zustand**: Zustand v5 (`src/store/editorStore.ts`)
* **Styling**: TailwindCSS v4 + Vanilla CSS (`src/styles.css`)
* **PDF-Rendering**: PDF.js (`pdfjs-dist`) via WebWorker
* **PDF-Manipulation**: `pdf-lib` + `@pdf-lib/fontkit` (für Schrifteinbettung)

---

## 2. Kern-Architektur

### 2.1 PDF-Rendering & Text-Koordinaten
* Das Dokument wird in `src/components/editor/PageView.tsx` gerendert.
* Ein `<canvas>` rendert die visuelle Seite.
* Ein transparenter HTML-Textlayer (`pdf-text-layer`) wird deckungsgleich darübergelegt, um native Textauswahl (Selektion) und Hover-Effekte zu ermöglichen.
* **Koordinaten-System**: PDF-Punkte haben ihren Nullpunkt links unten, y-Achse zeigt nach oben. Der Browser nutzt links oben als Nullpunkt, y-Achse zeigt nach unten. Die Hilfsfunktionen in `src/lib/pdf/screen.ts` übernehmen diese Umrechnung (`pdfPoint`, `screenRect`).

### 2.2 Echte Schwärzung (Redaction-Algorithmus)
In `src/lib/pdf/ContentStreamEditor.ts` befindet sich der Tokenizer, der den PDF-Byte-Inhaltsstrom parst.
* Beim Export (`export.ts`) sucht der Editor nach Textzeichen, die innerhalb der Schwärzungs-Rechtecke liegen.
* Die betroffenen Text-Operatoren (z. B. `TJ`, `Tj`, `Do`) werden aus dem ContentStream herausgefiltert und gelöscht.
* **Wichtig**: Der Text wird nicht bloß visuell mit einem schwarzen Kasten übermalt, sondern **physisch** aus den PDF-Bytes entfernt, um Auslesen oder Copy-Paste von geschwärzten Daten zu verhindern.

### 2.3 Font-Erkennungs- und Fallback-System
* Wenn ein Text geändert wird (`textReplace`), muss die Schriftart im PDF eingebettet werden.
* `resolvePDFCoreFontName` in `src/lib/pdf/fontDetect.ts` säubert den PostScript-Schriftnamen (entfernt z. B. Subset-Präfixe wie `ABCDEF+`) und ordnet ihn bekannten Webfonts (z. B. Arial, Times New Roman, Calibri) zu.
* `getFontBytes` lädt die TrueType-Schriftart (`.ttf`) im Hintergrund über **Bunny Fonts** herunter (spoofed UA für Rohdaten) und bettet sie ein.
* Fällt ein Download oder das Einbetten fehl, wird ein sicherer Fallback auf **Helvetica** angewendet.

---

## 3. Zustand & Undo/Redo

Der Zustand der Anwendung wird in `src/store/editorStore.ts` gehalten.
* **Annotationen**: Alle Änderungen (Highlights, Schwärzungen, Textboxen, Freihandzeichnungen, Kommentare) liegen im Array `annotations`.
* **Undo/Redo**: Bei jeder zustandsverändernden Operation wird ein Snapshot des aktuellen Stands (`annotations`, `pageOrder`) in das `past`-Array geschoben. Ein Aufruf von `undo()` schiebt den aktuellen Zustand in `future` und stellt den letzten Snapshot aus `past` wieder her.

---

## 4. Kommentar-System

* Jedes Kommentar-Element (`CommentAnno`) besitzt Koordinaten, Text, Replies und einen Status (`resolved: boolean`).
* **Klick-Priorisierung**: Der Button des Kommentar-Pins ruft `e.stopPropagation()` in `onPointerDown` auf. Dies verhindert, dass das Editor-Overlay den Klick abfängt und an gleicher Stelle fälschlicherweise eine neue Annotation platziert.
* **Replies**: Werden direkt im Popup oder in der Sidebar hinzugefügt. Auf PDF-Ebene werden diese als Annotationen exportiert und miteinander verknüpft.

---

## 5. UI/UX & Design (Swiss / Notion / Apple-Style)

Das Design wird minimalistisch und funktional gehalten:
* **Farbpalette**: Warme Grautöne, minimale Linien, edle Akzente (z. B. Blau als Primärfarbe).
* **Kontextsensitivität**: Einstellungsmenüs (wie der Schriftartenwähler `FontPicker`) werden nur dann eingeblendet, wenn das dazugehörige Werkzeug oder Element selektiert ist.
* **Dark Mode**: Reagiert auf die CSS-Klasse `.dark` im `html`-Element. Das Dokument-Canvas selbst bleibt immer weiß, während sich die Toolbar und Seitenleisten abdunkeln.

---

## 6. Automatisierte Tests

Das Projekt verfügt über eine Testsuite basierend auf **Vitest** mit der Browser-Simulation `happy-dom`.

### Tests ausführen:
* **Alle Tests einmalig ausführen**: `npm test`
* **Watch-Modus für aktive Entwicklung**: `npm run test:watch`
* **Test-UI im Browser öffnen**: `npm run test:ui`
* **Abdeckungsbericht generieren**: `npm run test:coverage`

### Test-Struktur:
1. `src/__tests__/pdf/fontDetect.test.ts`: Validiert die Font-Erkennung und Style-Zuweisung.
2. `src/__tests__/store/editorStore.test.ts`: Prüft das gesamte Annotations-Management, Undo/Redo und Seitensortierung.
3. *Erweiterung für E2E-Tests*: Playwright-Konfiguration für Browser-End-to-End Workflows (`e2e/`).

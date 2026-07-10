# PDF Studio – Umbau & Erweiterung

## 1. Performance: virtualisiertes Rendern & Fit-Modi

**Problem:** Aktuell rendert `PdfStudio` alle Seiten gleichzeitig als `PageView` in voller Auflösung → große PDFs hängen.

**Lösung:**

- `PageView` wird virtualisiert: jede Seite bekommt einen Platzhalter mit korrekter Höhe (aus der PDF-Seitengröße + Zoom berechnet, ohne zu rendern). Canvas/Text-Layer werden erst gemountet, wenn die Seite via `IntersectionObserver` (mit Vorlade-Rand, z.B. ±1 Seite) in den Viewport kommt, und wieder abgebaut, wenn sie weit draußen ist.
- Sichtbare Seiten: hohe Auflösung (aktuelle Logik). Thumbnails links: niedrige Auflösung (bereits so, `width=130`) — zusätzlich werden Thumbnails nur gerendert, wenn im Rail-Viewport sichtbar.
- Seitengrößen werden einmal beim Laden ausgelesen und im Store gecached (kein `getPage` pro Layout-Berechnung).

## 2. Fit-Modi & Standard-Skalierung

Neuer Store-State `viewMode: "fit-width" | "fit-height" | "two-page"` und `fitZoom` (berechnet).

- **Standard = `fit-width**`: Seite füllt Fensterbreite minus kleinem Padding. Wird beim Laden und bei Fenster-Resize automatisch neu berechnet.
- `**fit-height**`: Seite passt in die sichtbare Höhe.
- `**two-page` (E-Book)**: zwei Seiten nebeneinander mit Blättereffekt. Umsetzung über `react-pageflip` (leichtgewichtig, canvas-basiert) — Doppelseiten-Ansicht mit Umblätter-Animation, Navigation per Klick/Pfeil.
- Manuelles Zoom bleibt möglich und schaltet auf freien Zoom-Modus; Fit-Buttons stellen den jeweiligen Modus wieder her.

## 3. Responsives Layout

- `PdfStudio` und Toolbar responsiv: Menüleiste bricht auf kleinen Bildschirmen sauber um bzw. wandert in ein kompaktes Menü.
- Container nutzt `ResizeObserver`, um `fitZoom` bei jeder Größenänderung neu zu berechnen.
- Header-Zeilen nach Grid-Pattern (`min-w-0`, `shrink-0`, `truncate`) damit nichts abgeschnitten wird.

## 4. Einklappbare Sidebar (Thumbnails)

- Thumbnail-Rail wird ein-/ausklappbar (Toggle-Button). Eingeklappt: schmaler Streifen oder ganz versteckt mit sichtbarem Wieder-Öffnen-Button.
- Aktive Seite: **blauer Balken links** an der aktiven Thumbnail + **Auto-Scroll**, sodass die aktive Seite im Rail möglichst oben/sichtbar bleibt (`scrollIntoView` bei Wechsel).
- Design minimalistisch, Swiss-Style: klare Typo, viel Weißraum, dünne Trennlinien, reduzierte Farben (bestehende Tokens), keine überflüssigen Rahmen/Schatten.

## 5. Neue Menüleiste oben

Zwei Menü-Reiter links (Dropdown-Menüs, shadcn) + zentrierte Ansichts-Steuerung:

- **Datei** (links): PDF öffnen · Exportieren · Speichern · Speichern unter · Beenden.
  - *Speichern* = Datei überschreiben. Im Browser nur via File System Access API (`showSaveFilePicker`/File-Handle) möglich — wo unterstützt (Chrome/Edge), sonst Fallback auf Download mit Hinweis. Datei-Handle wird beim Öffnen gemerkt, falls über den Picker geöffnet.
  - *Beenden* = Tab schließen (`window.close()`, mit Bestätigung bei ungespeicherten Änderungen).
- **Werkzeuge** (links, neuer Reiter): alle Bearbeitungswerkzeuge (Auswahl, Markieren, Schwärzen, Text bearbeiten, Textbox, Stift, Kommentar) mit eindeutigen Beschriftungen und **Hover-Tooltips** (shadcn Tooltip) je Werkzeug. Kontextuelle Einstellungen (Farbe, Größe) erscheinen nur, wenn das passende Werkzeug aktiv ist → „Bedienoberflächen nur sichtbar, wenn gebraucht".
- **Mitte (zentriert):** Ansichtsmodi (Fit-Breite / Fit-Höhe / Doppelseite), Grid-View, Zoom −/%/+, sowie **Seiten-Navigation**: „Seite X von N", Vor/Zurück-Buttons und manuelles Eingabefeld für die Zielseite.
- **Rechts:** Theme, Sprache, primärer Export/Download-Button (minimalistisch halten).

## 6. Fonterkennung & Text bearbeiten (1:1-Ersetzung)

Die beiden Beta-`FontLoader`-Dateien werden zu einem überarbeiteten Modul `src/lib/pdf/fontDetect.ts` konsolidiert:

- **Stil-Erkennung:** pro geklicktem Text-Item Bold/Italic/Fontgröße aus PDF.js (`fontName`, Transform-Höhe) ermitteln; `resolvePDFCoreFontName` (Subset-Prefix strippen, PS-Namen mappen, Bold/Italic ableiten). Optional visueller Pixel-Abgleich als Fallback (`guessFontByPixelDiff`) — performance-begrenzt (nur bei Bedarf, nicht über hunderte lokale Fonts).
- **Font laden & einbetten:** `loadWebFont` (Bunny→Google Fallback) für die Live-Vorschau; `getFontBytes` lädt echte `.ttf` für die Einbettung beim Export via `pdf-lib` `embedFont` statt fix Helvetica. Bugfixes in den Betas (doppeltes `appendChild`, falsche Google-URL).
- **Editier-Verhalten:** Beim Klick mit „Text bearbeiten" wird ein editierbares Feld exakt an Position/Größe/Stil des Originals gelegt (Baseline-genau). **Textrahmen passt sich automatisch dem Inhalt an** (auto-grow). **Originaltext wird sofort entfernt**, sobald der neue Text steht (Live-Redaktion des darunterliegenden Glyphs im Viewer; beim Export echte Content-Stream-Löschung wie bisher über `filterRedactedText`).
- `TextReplaceAnno` erhält Felder `fontFamily`, `bold`, `italic`; Export nutzt diese für Font-Auswahl.

## 7. Bilder & Vektorgrafiken bearbeiten + eigenes Kontextmenü

- **Objekt-Erkennung:** Bild-XObjects und Vektorpfade der Seite werden erfasst (Position/BBox über PDF.js Operator-Liste bzw. Content-Stream). Auswahl-Werkzeug erlaubt Anklicken.
- **Verschieben / Skalieren:** ausgewählte Bilder/Grafiken per Handles bewegen & skalieren; Änderung als Transform gespeichert und beim Export in den Content-Stream geschrieben (Verschieben/Löschen ist im `ContentStreamEditor` bereits angelegt).
- **Ersetzen:** Bild durch hochgeladenes ersetzen (neues XObject einbetten, altes entfernen).
- **Eigenes Kontextmenü:** natives Browser-Menü auf der Seite unterdrücken (`onContextMenu preventDefault`) und durch shadcn `ContextMenu` ersetzen — kontextabhängige Befehle:
  - Text: Text bearbeiten, Schwärzen, Kopieren, Einfügen, Löschen.
  - Bild/Vektor: Ersetzen, Kopieren, Löschen (Schwärzen-Äquivalent), Verschieben.

## 8. i18n & Aufräumen

- Neue Übersetzungs-Keys (DE/EN) für alle neuen Menüs, Modi, Tooltips, Kontextmenü-Befehle.
- Redakt-Warnhinweis und Tooltips als Hover-Infos.

---

## Technischer Abriss (Dateien)

- `src/store/editorStore.ts`: `viewMode`, `fitZoom`, `sidebarOpen`, `pageSizes`, `fileHandle`, Aktionen; Bild/Objekt-Transforms.
- `src/components/editor/PdfStudio.tsx`: Virtualisierung (IntersectionObserver + Platzhalter), ResizeObserver-Fit, aktive-Seite-Fokus, Sidebar-Toggle, Kontextmenü-Root.
- `src/components/editor/Toolbar.tsx` → aufgeteilt: `MenuBar.tsx` (Datei-/Werkzeuge-Dropdowns), `ViewControls.tsx` (zentriert: Modi, Zoom, Seiten-Nav).
- `src/components/editor/ThumbnailRail.tsx`: einklappbar, aktiver blauer Balken, Auto-Scroll, lazy Thumbs.
- `src/components/editor/PageView.tsx`: Fit-Modi-Rendering, Custom-ContextMenu, Bild/Vektor-Handles, verbessertes Text-Edit.
- `src/components/editor/TwoPageView.tsx` (neu): `react-pageflip` E-Book-Ansicht.
- `src/lib/pdf/fontDetect.ts` (neu, aus den Betas), `export.ts` (Font-Einbettung), `types.ts` (erweiterte Annotationen), `ContentStreamEditor.ts` (Bild-Transform/Ersetzen), `i18n.tsx`.
- Neue Abhängigkeiten: `react-pageflip` (E-Book-Flip). shadcn `dropdown-menu`, `tooltip`, `context-menu` (falls noch nicht vorhanden).

## Hinweise / Grenzen

- „Speichern = überschreiben" funktioniert nur in Browsern mit File System Access API; sonst Download-Fallback.
- Vektor-/Bildbearbeitung im Content-Stream ist komplex; Fokus zuerst auf Bilder (XObjects) verschieben/skalieren/ersetzen/löschen, dann Vektorpfade.
- Alles bleibt lokal im Browser, kein Upload.

Umsetzung erfolgt in Etappen: (A) Layout/Menüs/Sidebar/Responsiv, (B) Performance/Fit-Modi, (C) Fonterkennung/Text, (D) Bilder/Vektoren + Kontextmenü.
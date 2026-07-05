# PDF-Editor Webapp

Eine rein im Browser laufende Web-App zum Bearbeiten von PDFs – ähnlich der Funktion von Adobe Acrobat, aber mit komplett eigenem Design. Kein Login, keine Cloud: Dateien werden lokal geladen, bearbeitet und wieder heruntergeladen. Oberfläche auf Deutsch/Englisch umschaltbar.

## Kernfunktionen

1. **PDF-Viewer** – Öffnen per Drag & Drop oder Dateiauswahl, mehrseitige Anzeige, Zoom, Seiten-Navigation, Thumbnails, pdf seiten können links in der seiten neu angeordnet werden, sowie in einer zusätzlichen grid view. Anordnung per drag and drop. webapp soll rechtsklick menü für menü haben und tastenkombinationen wie strg s strg a usw. unterstützen.
2. **Text markieren (Highlight)** – Textauswahl über die Textebene, farbige Markierungen (mehrere Farben) setzen und wieder entfernen.
3. **Stifte man soll mit verschiedenen stiften wie in apple notes im pdf rummalen können, mit automatischer glättung, damit ruckler mit  der maus etwas geglättet werden.**
4. **Schwärzen (echte Redaktion)** – Bereich aufziehen; der darunterliegende Text wird **wirklich aus dem Content-Stream gelöscht** (nicht nur überdeckt) und zusätzlich ein schwarzer Balken gezeichnet. Nutzt `filterRedactedText` aus dem hochgeladenen `ContentStreamEditor.ts`.
5. **Bestehenden Text ersetzen (Word/Acrobat-like)** – Auf einen Textabschnitt klicken, Inhalt inline bearbeiten. Beim Speichern wird der Originaltext an dieser Stelle gelöscht und der neue Text an gleicher Position/Größe neu gesetzt.
6. **Textboxen hinzufügen** – An beliebiger Stelle neue Textfelder platzieren, verschieben, Schriftgröße/Farbe wählen.
7. **Kommentarfunktion:** Kommentare sollen mit reply funktion geladen hinzugefügt und bearbeitet werden können. als textbox, kommentarfeld und kommentarhighlighter.
8. **Export** – Bearbeitetes PDF lokal herunterladen; alle Änderungen werden in die echten PDF-Bytes geschrieben.
  &nbsp;

## Layout & Bedienung

```text
┌───────────────────────────────────────────────────────────┐
│  Toolbar: Öffnen · Auswahl · Markieren · Schwärzen ·       │
│           Text bearbeiten · Textbox · | Zoom · Seite · DE/EN · Download │
├────────────┬──────────────────────────────────────────────┤
│ Thumbnails │                                              │
│  (Seiten)  │        PDF-Arbeitsfläche (Seite)             │
│            │   [Render-Canvas + Text-Layer + Overlay]     │
└────────────┴──────────────────────────────────────────────┘
```

- Linke Leiste: Seiten-Thumbnails. Oben: Werkzeugleiste mit aktivem Werkzeug-Zustand.
- Kontext-Panel (rechts/Popover) je nach Werkzeug: Markierfarbe, Schwärzungsoptionen, Textbox-Eigenschaften (Schriftgröße, Farbe).
- Jede Seite: PDF.js-Canvas + transparente Textebene (für Auswahl/Klick-zum-Bearbeiten) + Overlay-Ebene (Markierungen, Schwärzungs-Rechtecke, Textboxen als bewegliche Elemente).

## Technische Architektur

**Bibliotheken (per `bun add`):**

- `pdfjs-dist` – Rendering + Textpositionen (`getTextContent` liefert `transform`/`width`, exakt die von `ContentStreamEditor` erwarteten „redactedItems“).
- `pdf-lib` – Zugriff auf Seiten-Content-Streams, Einbetten von Schriften, Zeichnen neuer Textboxen, Schreiben der finalen Datei.
- `pako` – FlateDecode-Streams dekomprimieren/rekomprimieren.
- `zustand` – Editor-Zustand (Dokument, Werkzeug, Änderungsliste pro Seite).
- Schriften via `@fontsource` (siehe Design).

**Zustandsmodell:** Original-PDF-Bytes + pro Seite eine Liste von Edits: `highlight`, `redaction` (Rect), `textReplace` (Rect + alter/neuer Text + Position/Größe), `textbox` (Position, Text, Stil). Rendering der Overlays in Bildschirmkoordinaten; Umrechnung in PDF-User-Space beim Export.

**Bearbeitungs-/Export-Pipeline (beim Download):**

1. Original-Bytes mit `pdf-lib` laden.
2. Pro Seite den/die Content-Stream(s) holen, mit `pako` inflaten.
3. Mit `tokenizeStream` tokenisieren; `redactionRects` (aus Schwärzungen **und** aus Text-Ersetzungen) und die PDF.js-`redactedItems` an `filterRedactedText` übergeben → Text wird echt entfernt.
4. Tokens mit `serializeTokens` zurückschreiben, neuen Stream setzen (rekomprimiert oder unkomprimiert).
5. Für Schwärzungen zusätzlich schwarze Rechtecke zeichnen; für Text-Ersetzungen und Textboxen neuen Text mit eingebetteter Schrift (`pdf-lib` `drawText`) an umgerechneter Position platzieren.
6. Markierungen als halbtransparente Rechtecke (Multiply-Effekt) zeichnen.
7. `pdf-lib.save()` → Download.

**Koordinaten:** Zentrale Helfer für Umrechnung Bildschirm ↔ PDF-User-Space (Viewport-Skalierung, Y-Achsen-Flip), damit Overlays und Export exakt übereinstimmen.

**Runtime:** Alles clientseitig; kein Backend. PDF.js-Worker via Vite `?url`-Import konfigurieren. Schwere Verarbeitung (Tokenisierung/Export) läuft im Browser; für große PDFs mit Ladeindikator.

## Design-System

Eigenständiger, präziser „Werkstatt“-Look – ruhig, technisch, dokumentenfokussiert (kein Adobe-Rot, kein generisches Lila).

- **Schriften:** UI „Figtree“; Zahlen/Felder (Zoom, Seitenzahl, Koordinaten) „JetBrains Mono“. Installation via `@fontsource/figtree` und `@fontsource/jetbrains-mono`.
- **Farben (als Tokens in `src/styles.css`, oklch):**
  - Arbeitsfläche/Desk: weiches Neutralgrau `oklch(0.96 0.005 250)`; Papier: reines Weiß mit weichem Schatten.
  - Werkzeugleisten: dunkles Anthrazit `oklch(0.24 0.02 260)`.
  - Primär/Aktiv: sattes Blau `oklch(0.55 0.16 250)`.
  - Schwärzung: Schwarz mit rotem Warn-Rand `oklch(0.55 0.22 25)`.
  - Markieren: Gelb/Grün/Blau/Pink Presets.
  - Dark-Mode-Variante konsequent über Tokens.
- **Interaktion:** aktives Werkzeug klar hervorgehoben, Overlays mit sauberen Griffen (Resize/Move), dezente Übergänge; Cursor je Werkzeug (Fadenkreuz beim Schwärzen, Text-Cursor beim Markieren).

## Umsetzungsschritte

1. Abhängigkeiten + Schriften installieren; `ContentStreamEditor.ts` nach `src/lib/pdf/` übernehmen; Design-Tokens & Fonts einrichten.
2. Grundgerüst: Route/Layout, Toolbar, Thumbnails, i18n (DE/EN-Umschalter), Zustand (zustand).
3. PDF.js-Viewer: Rendering, Text-Layer, Zoom, Seiten-Navigation, Worker-Setup.
4. Overlay-System + Koordinaten-Helfer; Werkzeug „Markieren“.
5. Werkzeug „Schwärzen“ (Overlay + Anbindung an `filterRedactedText`).
6. Werkzeug „Text ersetzen“ (Klick → Inline-Edit → Redaktion + Neusatz) und „Textbox hinzufügen“.
7. Export-Pipeline (pdf-lib + pako + ContentStreamEditor) verdrahten; Download.
8. Politur: leerer Zustand/Upload, Ladeindikatoren, Fehlerbehandlung, Responsive, SEO-Head (Titel/Description), QA mit Test-PDFs.

## Hinweise / Grenzen

- Echte In-Place-Ersetzung von PDF-Text ist aufwändig; der robuste Ansatz „Original löschen + neuen Text an gleicher Stelle setzen“ liefert Word/Acrobat-ähnliches Ergebnis, kann aber bei exotischen Schriften/Encodings visuell leicht abweichen (Standard-Schrift wird für Neusatz eingebettet). Kommentar: Nutze hier wenn möglich schrifterkennung und lade dann die schriften vom lokalen pc oder wenn nicht vorhanden von bunnyfonts und dann google fonts.
- Fokus zunächst auf Standard-Text-PDFs (nicht gescannte Bilder ohne Textebene).
- Sehr große/komplexe PDFs können im Browser spürbar Rechenzeit brauchen. (nutze hier lazy loading, falls das hilft)
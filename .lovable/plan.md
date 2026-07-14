# Fonterkennung & deckungsgleiche Platzierung – Fix + Tests

## Problemanalyse

Die aktuelle Pipeline verlässt sich auf zwei fragile Wege:

1. `**resolvePDFCoreFontName**` rät Familie/Stil aus dem PostScript-Namen (Heuristik + kleiner `psNameMap`). Bei Subset-Prefixen (`ABCDEF+`), CID-Namen (`g_d0_f1`), Herstellersuffixen (`-BoldMT`, `Semibold`, `Black`, `Cond`) und unbekannten Schriften greift nur eine grobe Regex → falsche Familie/Weight/Italic.
2. `**fontVectorMatch` (KNN mit 15-D-Fingerprint)** matched anschließend eine Bunny-Font. Beim Export wird diese Bunny-Font mit `getFontBytes` neu eingebettet. Deren Glyph-Advance-Widths weichen von den Original-Widths ab → Text wird zwar an gleicher Baseline positioniert, endet aber nicht deckungsgleich (Kerning/Advance-Drift).

Ergebnis: sichtbar verschobener Ersatztext und häufig falsch erkannter Bold/Italic-Zustand.

## Lösung – „Original zuerst"

Die im PDF eingebettete Fontdatei ist die Wahrheit über Metriken, Weight und Italic. Wir nutzen sie direkt und behalten Web-Fonts nur als Fallback. 

Nein, bzw  ja, aber nur, wenn genügend character in der eingebetteten font vorhanden sind. Ansonsten **muss** ein Algorithmus genutzt werden, der die Fonts zuverlässig anhand der Vektoren erkennen kann. Suche hierfür nach Lösungen im Internet, vielleicjt gibt es da schon was. Ansonsten nutze den Implementierungsplan hier:

ON-DEVICE FONTERKENNUNG IM BROWSER

IMPLEMENTIERUNGSPLAN FÜR LOVABLE AI (VITE & BUNNY FONTS INTEGRATION)

   Architektur-Paradigma: Deterministisch & Offline

   Dieses System verzichtet vollständig auf künstliche Intelligenz (KI) und Cloud-Anbindungen. Die Erkennung basiert auf der

   mathematischen Analyse eingebetteter PDF-Fontstrukturen, der Bereinigung kryptischer Subset-Präfixe und einem

   performanten Metrik-Abgleich (Glyphen-Breiten-Hashing) gegen ein lokales Referenz-Repository, das auf Bunny Fonts

   gemappt wird.

1. Systemarchitektur & Datenfluss

Da PDF-Parsing rechenintensiv ist, wird die Erkennungslogik in einen Web Worker ausgelagert, um den UI-Thread

von React/Vite flüssig zu halten. Lovable AI kann dieses Muster mithilfe des nativen Vite-Worker-Imports umsetzen.

              [PDF Upload] → [Vite Main Thread] → (Transferable ArrayBuffer) → [Web Worker]

                                                              ↓

           [UI Rendering] ← [Bunny CSS Loader] ← (Ergebnis-JSON) ← [PDF.js Parsing & Hashing]

2. Der Kern-Algorithmus zur Fonterkennung

PDFs betten Schriften meist als unvollständige Untergruppen (Subsets) ein, um Dateigröße zu sparen. Diese

erhalten ein zufälliges 6-stelliges Präfix gefolgt von einem Plus-Zeichen (z. B. MSTFCD+Roboto-Bold ). Unser

Algorithmus löst dies in drei Stufen auf:

Stufe A: Präfix-Bereinigung & Direkter Namensabgleich

Der Parser liest das Attribut /BaseFont aus dem Font-Dictionary. Wenn der Name nach dem Abschneiden des

Musters ^[A-Z]{6}\+ einem bekannten Bunny Font entspricht, ist die Erkennung sofort abgeschlossen.

   const cleanFontName = (baseFont) => {

      // Entfernt "ABCDEF+" Präfixe und normalisiert Namen

      const clean = baseFont.replace(/^[A-Z]{6}\+/, '');

      return clean.split(',')[0].split('-')[0]; // Liefert z. B. "Roboto"

   };

Stufe B: Glyphen-Metrik-Hashing (No-AI Fallback)

Falls der Fontname vollständig verschlüsselt ist (z. B. FBAXYZ+Font1 ), nutzen wir die im PDF-Font-Dictionary

hinterlegten Zeichenbreiten ( /Widths ). Da jede Schriftart hochindividuelle Zeichenproportionen besitzt, bilden die

Breiten einer definierten ASCII-Zeichenkette einen eindeutigen Fingerabdruck.

Wir vergleichen das extrahierte Breiten-Array der Testzeichen T = {c_1, c_2, ..., c_n} (z. B. "A, E, H, M, a, e, o") mit

unserer lokalen Datenbank:

                                      Differenz = Σ | Width_PDF(c) - Width_Ref(c) |

Der Referenz-Font mit der geringsten Differenz (idealerweise 0) wird als Treffer gewertet.

Implementierungsplan: On-Device Fonterkennung                                                                     Seite 1 von 4

3. Datenbank-Struktur (Bunny Fonts Mapping)

Die lokale Lookup-Datenbank wird als statische JSON-Datei in Vite ( public/font-db.json ) abgelegt. Sie enthält

die Metriken der gängigsten Webfonts von Bunny Fonts.

   {

       "Roboto-Regular": {

         "family": "Roboto",

         "weight": 400,

         "italic": false,

         "bunnyKey": "roboto",

         "widths": { "65": 667, "66": 667, "67": 722, "97": 556, "101": 556 } // ASCII-Codes

       },

       "PlayfairDisplay-BoldItalic": {

         "family": "Playfair Display",

         "weight": 700,

         "italic": true,

         "bunnyKey": "playfair-display",

         "widths": { "65": 780, "66": 715, "67": 725, "97": 510, "101": 490 }

       }

   }

4. Formatierungserkennung (Bold & Italic)

Die Erkennung von Formatierungen erfolgt deterministisch über die PDF-Spezifikationen im /FontDescriptor :

  Eigenschaft       PDF-Quelle                                 Erkennungs-Logik

  Italic            /Flags (Bit 7 / Wert 64) oder /            Wenn Flag bitweise gesetzt ist oder ItalicAngle existiert

  (Kursiv)          ItalicAngle < 0                            → italic: true

                    /FontWeight oder /StemV

  Bold (Fett)                                                  Gewicht ≥ 700 oder StemV > 120 → weight: 700

                    (Stammbreite)

                    Transformationsmatrix Tm im Text-Render-   Wenn der Scherungs-Parameter (c) im PDF-Text-Stream

  Faux Italic

                    Stream                                     ungleich 0 ist.

Implementierungsplan: On-Device Fonterkennung                                                                   Seite 2 von 4

5. Schritt-für-Schritt-Prompts für Lovable AI

Füttere Lovable AI mit diesen präzisen, sequentiellen Prompts, um die Anwendung fehlerfrei zu generieren.

  PROMPT 1: Projekt-Setup & PDF.js-Worker-Konfiguration

  "Erstelle eine React/TypeScript-Anwendung unter Vite. Installiere das Paket 'pdfjs-dist'. Richte

  einen dedizierten Web Worker für das PDF-Parsing ein. Stelle sicher, dass Vite den Worker über

  'new Worker(new URL(..., import.meta.url))' korrekt auflöst, ohne Build-Fehler zu erzeugen.

  Erstelle ein UI mit einer Dropzone für PDF-Dateien und einer Ladeanzeige."

  PROMPT 2: Font-Extraktions-Logik im Web Worker

  "Schreibe     die   Logik    für   den   Web   Worker.   Der   Worker   soll   eine   hochgeladene      PDF-Datei   als

  ArrayBuffer einlesen, die PDF-Seiten durchlaufen und alle einzigartigen Font-Ressourcen aus

  'page.commonObjs' extrahieren. Für jeden Font müssen wir folgende Daten aus dem PDF-Dictionary

  auslesen: BaseFont, FontDescriptor (Flags, FontWeight, ItalicAngle, StemV) sowie die Breiten-

  Tabelle (/Widths) und das /ToUnicode-Mapping. Sende diese extrahierten Daten strukturiert an den

  UI-Thread zurück."

  PROMPT 3: Referenzdatenbank & Matching-Algorithmus

  "Erstelle im public/ Ordner eine 'font-db.json' mit Referenz-Metriken (ASCII-Breiten) für die 20

  gängigsten Google/Bunny Fonts (z. B. Roboto, Open Sans, Lato, Montserrat, Inter, Merriweather,

  Playfair Display). Implementiere in TypeScript einen deterministischen Matching-Algorithmus: 1.

  Versuche zuerst, den bereinigten BaseFont-Namen (ohne 6-stelligen Subset-Prefix) in der DB zu

  finden. 2. Falls kein Treffer, vergleiche die extrahierten Breiten der Standard-Zeichen (ASCII

  65-122) mit der DB und ermittle die minimale absolute Differenz. 3. Bestimme das Gewicht (Bold)

  und Kursiv-Status anhand der PDF-Flags und StemV-Werte."

  PROMPT 4: Bunny Fonts Integration & UI-Ausgabe

  "Implementiere       die    visuelle     Ausgabe.   Sobald     ein   Font   erkannt   wurde,     soll   die   App   die

  entsprechende CSS-Datei dynamisch von Bunny Fonts laden (Nutze die datenschutzfreundliche URL-

  Struktur:      [https://fonts.bunny.net/css?family=family-name:weights](https://fonts.bunny.net/css?family=family-name:weights)).                Rendere     eine    Liste    der

  erkannten Schriften mit: - Dem erkannten Familiennamen und der Konfidenz (Name-Match vs. Metrik-

  Match). - Formatierungs-Badges (Bold, Italic, Regular). - Einem interaktiven Textfeld, das den

  Beispieltext direkt in dem erkannten Bunny Font anzeigt."

6. Beispiel-Code: Der deterministische Matcher

Dieses Code-Snippet dient Lovable AI als direkte Vorlage für die Implementierung der mathematischen

Erkennungslogik im Matching-Utility:

Implementierungsplan: On-Device Fonterkennung                                                                   Seite 3 von 4

   export interface FontMetrics {

     family: string;

     weight: number;

     italic: boolean;

     bunnyKey: string;

     widths: Record<string, number>;

   }

   export function matchFont(

     pdfWidths: Record<string, number>,

     db: Record<string, FontMetrics>

   ): { matchedFont: FontMetrics; confidence: number } {

     let bestMatch: FontMetrics | null = null;

     let minDifference = Infinity;

       for (const key in db) {

         const ref = db[key];

         let currentDiff = 0;

         let compareCount = 0;

           // Vergleiche nur existierende ASCII-Zeichen

           for (const charCode in ref.widths) {

             if (pdfWidths[charCode] !== undefined) {

               currentDiff += Math.abs(pdfWidths[charCode] - ref.widths[charCode]);

               compareCount++;

             }

           }

           if (compareCount > 0) {

             const avgDiff = currentDiff / compareCount;

             if (avgDiff < minDifference) {

               minDifference = avgDiff;

               bestMatch = ref;

             }

           }

       }

       // Eine durchschnittliche Differenz von < 5 Einheiten gilt als exakter Match

       const confidence = bestMatch

         ? Math.max(0, Math.min(100, 100 - (minDifference * 2)))

         : 0;

       return { matchedFont: bestMatch!, confidence };

   }

Implementierungsplan: On-Device Fonterkennung                                         Seite 4 von 4

&nbsp;

### Änderungen (nur `src/lib/pdf/*`, `src/components/editor/PageView.tsx`, `src/lib/pdf/export.ts`)

**1. Neuer Font-Introspector `src/lib/pdf/fontIntrospect.ts**`

- Nimmt ein pdf.js-`page` + `fontName`, holt via `page.commonObjs.get(fontName)` das Font-Objekt und dessen `.data` (Uint8Array der Fontbytes wenn eingebettet).
- Parst mit `fontkit` (bereits als Dep vorhanden über `@pdf-lib/fontkit`) und liest:
  - `familyName`, `subfamilyName`, `postscriptName`, `fullName`
  - `italicAngle` (≠ 0 → italic) und OS/2 `fsSelection` bit 0
  - OS/2 `usWeightClass` (≥ 600 → bold), `fsSelection` bit 5 (bold)
- Fallback-Kette wenn nicht eingebettet oder Parse-Fehler: `fontObj.name` → `resolvePDFCoreFontName`.
- Cache pro Dokument (WeakMap<PdfDocumentProxy, Map<fontName, FontInfo>>) inkl. der Rohbytes.

**2. `resolvePDFCoreFontName` präzisieren**

- Erweiterte Style-Erkennung: `SemiBold|DemiBold|ExtraBold|Heavy|Black|Ultra|Thin|Light|Medium|Book|Regular|Cond(ensed)?|Narrow`.
- Weight-Klassifikation (>=600 → bold) statt „irgendwo bold im Namen".
- Rückgabe erweitert um `weight: number` und `postscriptName: string` (Klartext, nicht nur Familie).
- Existing `psNameMap` bleibt als Alias-Tabelle für Legacy-Fälle.

**3. `PageView.replaceSpan` nutzt Introspector**

- Statt KNN → Aufruf `getFontInfo(page, item.fontName)`. Ergebnis in die `TextReplaceAnno` schreiben inkl. neuem Feld `originalFontBytes?: Uint8Array` (optional).
- Loads Web-Font weiterhin für die On-Screen-Vorschau (CSS-Family).

**4. `types.ts`: `TextReplaceAnno` bekommt optionale Felder**

- `originalFontBytes?: Uint8Array`
- `weight?: number`
- `italicAngle?: number`

**5. `export.ts` – Font-Resolver umstellen**

- Neuer `makeFontResolver` bevorzugt in dieser Reihenfolge:
  1. `annotation.originalFontBytes` (identische Metriken → deckungsgleich).
  2. Cache im Dokument (gleiche Familie/Weight schon in dieser Session verwendet).
  3. `getFontBytes(family, bold, italic)` (Bunny).
  4. Helvetica-Fallback + Toast-Warnung.
- Bei 1) wird `pdf-lib.embedFont(bytes, { subset: true })` genutzt; Text-Rendering nutzt exakt die Original-Advances → Textbreite stimmt.
- `drawWrappedText` bleibt gleich (Position `[transform[4], transform[5]]` = korrekte PDF-Baseline).

**6. Text-selection-basiertes Replace behält Original-Position**

- `TextReplaceAnno.transform` bereits vorhanden; sicherstellen, dass beim Update (FontPicker) `transform` NICHT überschrieben wird – nur `text`, `fontFamily`, `bold`, `italic`, `fontSize`.

## Automatisierte Tests (`src/__tests__/pdf/`)

Bereits vorhanden: `fontDetect.test.ts`, `fontVectorMatch.test.ts`, `fontRecognition.test.ts`. Diese ausbauen + neue hinzufügen.

**1. `fontDetect.test.ts` erweitern**

- Parametrisiert über eine Matrix von PS-Namen mit erwarteter `{family, isBold, isItalic, weight}`:
  - Subset-Prefixe (`ABCDEF+`), `-BoldMT`, `-BoldItalicMT`, `,Bold`, `PSMT`
  - Weight-Suffixe: `Regular/Light/Medium/SemiBold/Bold/Black/Heavy/Thin`
  - Style-Suffixe: `Italic/Oblique/It`
  - CID-Namen: `g_d0_f1`, `TTF4t00`, `F1`, numerisch
  - Google-Fonts-Muster: `Roboto-BoldItalic`, `OpenSans-SemiBoldItalic`
  - „schmutzige" Namen: `MyFont-Cond-BoldOblique`

**2. Neu: `fontIntrospect.test.ts**`

- Nutzt bestehendes `scripts/generateTestPdf.ts` (bzw. `public/test-fonts.pdf`), lädt Seiten in Node über `pdfjs-dist/legacy` und prüft für jede Textzeile, dass `getFontInfo` die gleiche `family/isBold/isItalic` liefert wie der im Test-PDF hinterlegte Erwartungswert. Ziel: 100% Match.
- Wenn `public/test-fonts.pdf` fehlt, wird generateTestPdf im `beforeAll` ausgeführt.

**3. Neu: `deckungsgleich.test.ts**` (portiert aus `scripts/testDeckungsgleich.ts`)

- Ersetzt in einer Test-PDF ausgewählte Items durch ihren eigenen Text via `exportPdf`.
- Lädt Export-PDF, sucht die gleichen Strings, vergleicht `transform[4]/[5]` (Position) und `Math.hypot(t[0], t[1])` (Fontsize).
- Toleranz `< 0.5` PDF-Punkte, `expect` schlägt sonst fehl.
- Läuft über mehrere Fonts (Roboto, Arial, Times, Calibri) durch mehrere Testseiten.

**4. Testinfrastruktur**

- `test pdfs/` in Vitest zugänglich machen (bereits im Repo).
- Coverage-Include um `fontIntrospect.ts` erweitern.

## Verifikation

- `bun run test` – alle neuen Tests grün (Ziel: 100% Match auf Test-Korpus, Deckungsgleich-Toleranz < 0.5 pt).
- Manueller Smoke-Test in der Web-App mit einer PDF, die Arial-Bold, Calibri-Italic und Times enthält: Klick auf Text → erkannter Font in Toast korrekt → Speichern → Text an identischer Position, identische Breite.

## Technische Notizen

- Keine neue Dependency – `fontkit` ist über `@pdf-lib/fontkit` verfügbar; für Introspektion kann direkt `fontkit` (Sub-Dep) importiert oder eine minimale eigene Parse-Routine für den `name`/`OS/2`-Table geschrieben werden. Bevorzugt: `import fontkit from "@pdf-lib/fontkit"` und `fontkit.create(bytes)`.
- `opentype.js` ist bereits Dep (aus `fontVectorMatch`) – kann alternativ genutzt werden.
- Keine Änderungen an Build/SSR-Config, `vite.config.ts`, Routen, oder Store-Kern.
- Alle Operationen laufen im Browser; im Node-Testlauf via `pdfjs-dist/legacy` (bereits verwendet).
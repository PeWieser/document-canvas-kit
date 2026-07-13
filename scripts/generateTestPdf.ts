import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import opentype from "opentype.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Scanning C:/Windows/Fonts for TTF files...");

  const fontsDir = "C:/Windows/Fonts";
  if (!fs.existsSync(fontsDir)) {
    console.error("C:/Windows/Fonts does not exist!");
    process.exit(1);
  }

  const files = fs.readdirSync(fontsDir);
  const ttfFiles = files.filter((f) => f.toLowerCase().endsWith(".ttf"));
  console.log(`Found ${ttfFiles.length} potential TTF files.`);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const processedFonts: {
    family: string;
    isBold: boolean;
    isItalic: boolean;
    path: string;
    fontBytes: Uint8Array;
    embeddedFont: any;
  }[] = [];

  // We want to guarantee these core fonts are loaded first so they are always available for the classic test
  const coreFonts = [
    { name: "Arial", file: "arial.ttf", isBold: false, isItalic: false },
    { name: "Arial-Bold", file: "arialbd.ttf", isBold: true, isItalic: false },
    { name: "TimesNewRoman", file: "times.ttf", isBold: false, isItalic: false },
    { name: "CourierNew", file: "cour.ttf", isBold: false, isItalic: false }
  ];

  const loadedCoreFonts: Record<string, any> = {};

  for (const f of coreFonts) {
    const filePath = path.join(fontsDir, f.file);
    if (fs.existsSync(filePath)) {
      try {
        const fontBytes = new Uint8Array(fs.readFileSync(filePath));
        const embedded = await pdfDoc.embedFont(fontBytes, { subset: true });
        loadedCoreFonts[f.name] = embedded;
        processedFonts.push({
          family: f.name === "TimesNewRoman" ? "Times New Roman" : (f.name === "CourierNew" ? "Courier New" : "Arial"),
          isBold: f.isBold,
          isItalic: f.isItalic,
          path: filePath,
          fontBytes,
          embeddedFont: embedded
        });
        console.log(`Loaded core font: ${f.name}`);
      } catch (err: any) {
        console.error(`Failed to load core font ${f.name}:`, err.message);
      }
    }
  }

  let count = processedFonts.length;
  for (const file of ttfFiles) {
    if (count >= 60) {
      break;
    }
    // Skip if it's one of the core font files we already loaded
    if (coreFonts.some(f => f.file.toLowerCase() === file.toLowerCase())) {
      continue;
    }
    const filePath = path.join(fontsDir, file);
    try {
      const fontBytes = new Uint8Array(fs.readFileSync(filePath));

      // Parse with opentype to check validity and extract name
      const font = opentype.parse(
        fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength),
      );

      const platformNames = font.names.windows || font.names.macintosh;
      const family = platformNames && platformNames.fontFamily
        ? platformNames.fontFamily.en || Object.values(platformNames.fontFamily)[0]
        : "";
      const subfamily = platformNames && platformNames.fontSubfamily
        ? platformNames.fontSubfamily.en || Object.values(platformNames.fontSubfamily)[0]
        : "";

      if (!family) {
        continue;
      }

      // Check if basic glyphs are present
      if (font.charToGlyphIndex("e") === 0 || font.charToGlyphIndex("a") === 0) {
        continue;
      }

      const lowerSub = subfamily.toLowerCase();
      const isBold = lowerSub.includes("bold");
      const isItalic = lowerSub.includes("italic") || lowerSub.includes("oblique");

      // Try to embed
      const embeddedFont = await pdfDoc.embedFont(fontBytes, { subset: true });

      processedFonts.push({
        family,
        isBold,
        isItalic,
        path: filePath,
        fontBytes,
        embeddedFont,
      });

      count++;
      console.log(`Loaded & embedded [${count}/60]: ${family} (${subfamily})`);
    } catch (err: any) {
      // Filter out corrupt/non-TTF or fonts fontkit cannot handle
    }
  }

  console.log(`Successfully embedded ${processedFonts.length} fonts.`);

  // Page 1: Classic test lines and rotated text blocks (required by fontVectorMatch.test.ts)
  let page = pdfDoc.addPage([595, 842]);
  let pageNum = 1;

  const drawLine = (text: string, fontName: string, size: number, color: any, yVal: number) => {
    page.drawText(text, {
      x: 50,
      y: yVal,
      size,
      font: loadedCoreFonts[fontName],
      color,
    });
  };

  drawLine('This is Arial Regular, black, size 12', 'Arial', 12, rgb(0, 0, 0), 800);
  drawLine('This is Arial Bold, red, size 16', 'Arial-Bold', 16, rgb(1, 0, 0), 778);
  drawLine('Times New Roman Regular, blue, size 14', 'TimesNewRoman', 14, rgb(0, 0, 1), 752);
  drawLine('Courier New Regular, green, size 18', 'CourierNew', 18, rgb(0, 0.5, 0), 728);
  drawLine('A mix of characters to test subsetting: ABCXYZ abcxyz 123890', 'Arial', 12, rgb(0,0,0), 700);

  // Draw rotated text blocks
  page.drawText('Rotated 0 degrees, black, size 12', {
    x: 50,
    y: 200,
    size: 12,
    font: loadedCoreFonts['Arial'],
    color: rgb(0, 0, 0),
    rotate: { angle: 0, type: 'degrees' }
  });

  page.drawText('Rotated 45 degrees, red, size 14', {
    x: 100,
    y: 180,
    size: 14,
    font: loadedCoreFonts['Arial-Bold'],
    color: rgb(1, 0, 0),
    rotate: { angle: 45, type: 'degrees' }
  });

  page.drawText('Rotated 90 degrees, blue, size 16', {
    x: 150,
    y: 160,
    size: 16,
    font: loadedCoreFonts['TimesNewRoman'],
    color: rgb(0, 0, 1),
    rotate: { angle: 90, type: 'degrees' }
  });

  page.drawText('Rotated 120 degrees, green, size 18', {
    x: 200,
    y: 140,
    size: 18,
    font: loadedCoreFonts['CourierNew'],
    color: rgb(0, 0.5, 0),
    rotate: { angle: 120, type: 'degrees' }
  });

  // Page 2+: System fonts test (required by fontRecognition.test.ts)
  page = pdfDoc.addPage([595, 842]);
  pageNum++;
  let y = 800;

  for (let i = 0; i < processedFonts.length; i++) {
    if (y < 50) {
      page = pdfDoc.addPage([595, 842]);
      y = 800;
      pageNum++;
    }

    const f = processedFonts[i];
    const text = `${f.family} - Bold ${f.isBold} - Italic ${f.isItalic} - The quick brown fox`;

    try {
      page.drawText(text, {
        x: 50,
        y,
        size: 12,
        font: f.embeddedFont,
        color: rgb(0, 0, 0),
      });
      y -= 22;
    } catch (err: any) {
      console.error(`Error drawing text for ${f.family}:`, err.message);
    }
  }

  const outBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, "../public/test-fonts.pdf");
  fs.writeFileSync(outPath, outBytes);
  console.log(
    `Saved multi-page test PDF with ${processedFonts.length} fonts on ${pageNum} pages to ${outPath}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

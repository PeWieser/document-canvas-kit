import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Generating test PDF...');
  
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // We will use standard local fonts for the test
  const fontsToTest = [
    { name: 'Arial', path: 'C:/Windows/Fonts/arial.ttf' },
    { name: 'Arial-Bold', path: 'C:/Windows/Fonts/arialbd.ttf' },
    { name: 'TimesNewRoman', path: 'C:/Windows/Fonts/times.ttf' },
    { name: 'CourierNew', path: 'C:/Windows/Fonts/cour.ttf' }
  ];

  const loadedFonts: any = {};

  for (const f of fontsToTest) {
    console.log(`Loading ${f.name}...`);
    const fontBytes = new Uint8Array(fs.readFileSync(f.path));
    
    // Embed with subsetting!
    loadedFonts[f.name] = await pdfDoc.embedFont(fontBytes, { subset: true });
  }

  const page = pdfDoc.addPage([595, 842]); // A4
  
  let y = 800;
  
  const drawLine = (text: string, fontName: string, size: number, color: any) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: loadedFonts[fontName],
      color,
    });
    y -= (size + 10);
  };

  drawLine('This is Arial Regular, black, size 12', 'Arial', 12, rgb(0, 0, 0));
  drawLine('This is Arial Bold, red, size 16', 'Arial-Bold', 16, rgb(1, 0, 0));
  drawLine('Times New Roman Regular, blue, size 14', 'TimesNewRoman', 14, rgb(0, 0, 1));
  drawLine('Courier New Regular, green, size 18', 'CourierNew', 18, rgb(0, 0.5, 0));
  drawLine('A mix of characters to test subsetting: ABCXYZ abcxyz 123890', 'Arial', 12, rgb(0,0,0));

  const outBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, '../public/test-fonts.pdf');
  fs.writeFileSync(outPath, outBytes);
  console.log(`Saved test PDF to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

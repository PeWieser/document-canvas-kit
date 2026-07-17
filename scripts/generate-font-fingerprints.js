import fs from 'fs';
import path from 'path';
import https from 'https';
import opentype from 'opentype.js';
import initSqlJs from 'sql.js';
import { 
  getNormalizedLines, 
  rasterizeLines, 
  countHoles, 
  calculateHuMoments,
  packMask
} from '../src/lib/pdf/fontMatchingEngine.ts';

const __dirname = import.meta.dirname;

const FONTS_TO_FETCH = [
  // Sans-serif
  'Roboto', 'Lato', 'Open Sans', 'Montserrat', 'Oswald', 'Source Sans Pro',
  'Ubuntu', 'Nunito', 'Raleway', 'PT Sans', 'Inter', 'Poppins', 'Noto Sans',
  'Work Sans', 'Fira Sans', 'Quicksand', 'Mulish', 'Barlow', 'Kanit', 'Rubik',
  'Dm Sans', 'Cabin', 'Karla', 'Arimo', 'Oxygen', 'Hind', 'Josefin Sans',
  'Libre Franklin', 'Questrial', 'Manrope', 'Dosis',
  // Serif
  'Merriweather', 'Playfair Display', 'PT Serif', 'Lora', 'Roboto Slab',
  'Noto Serif', 'Crimson Text', 'Libre Baskerville', 'EB Garamond',
  'Arvo', 'Bitter', 'Cardo', 'Domine', 'Cormorant Garamond',
  // Monospace
  'Inconsolata', 'Source Code Pro', 'Fira Code', 'Roboto Mono', 'Ubuntu Mono',
  'Courier Prime', 'Space Mono'
];

// 20 Discriminator characters as defined in plan
const DISCRIMINATOR_CHARS = [
  'a', 'b', 'e', 'g', 'i', 'o', 'p', 't', 
  'A', 'B', 'G', 'Q', 'R', 'S', 'W', 
  '1', '4', '7', '&', '@'
];

const TEMP_DIR = path.join(__dirname, '..', 'temp_fonts');
const OUT_DB_FILE = path.join(__dirname, '..', 'public', 'font-fingerprints.db');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

function downloadString(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadString(response.headers.location).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}: ${response.statusCode}`));
      }
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function processFonts() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  console.log("Initializing SQLite in-memory database...");
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Create tables according to plan
  db.run(`
    CREATE TABLE fonts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family TEXT NOT NULL,
      is_bold INTEGER NOT NULL,
      is_italic INTEGER NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE font_features (
      font_id INTEGER NOT NULL,
      char TEXT NOT NULL,
      holes INTEGER NOT NULL,
      h1 REAL NOT NULL,
      h2 REAL NOT NULL,
      h3 REAL NOT NULL,
      h4 REAL NOT NULL,
      h5 REAL NOT NULL,
      h6 REAL NOT NULL,
      h7 REAL NOT NULL,
      width INTEGER NOT NULL,
      raster_mask BLOB NOT NULL,
      FOREIGN KEY(font_id) REFERENCES fonts(id)
    );
  `);

  // B-Tree indexes on char and holes for massive runtime query acceleration
  db.run(`CREATE INDEX idx_features_char_holes ON font_features (char, holes);`);
  db.run(`CREATE INDEX idx_features_font_id ON font_features (font_id);`);

  // Preparation statements
  const insertFontStmt = db.prepare(`
    INSERT INTO fonts (family, is_bold, is_italic) VALUES (?, ?, ?);
  `);
  
  const insertFeatureStmt = db.prepare(`
    INSERT INTO font_features (font_id, char, holes, h1, h2, h3, h4, h5, h6, h7, width, raster_mask)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  function insertFontData(family, isBold, isItalic, font) {
    // Insert font metadata
    insertFontStmt.run([family, isBold ? 1 : 0, isItalic ? 1 : 0]);
    const fontId = db.exec("SELECT last_insert_rowid();")[0].values[0][0];

    let extractedCount = 0;
    for (const char of DISCRIMINATOR_CHARS) {
      try {
        const glyph = font.charToGlyph(char);
        const pathObj = glyph.getPath();
        
        // Feature extraction:
        // 1. Flatten curves and normalize geometry to 64x64 grid
        const lines = getNormalizedLines(pathObj.commands);
        if (lines.length === 0) continue;
        
        // 2. Scanline rasterization
        const mask = rasterizeLines(lines);
        
        // 3. Topology: count holes
        const holes = countHoles(mask);
        
        // 4. Hu moments (log-transformed)
        const hu = calculateHuMoments(mask, 64, 64);
        
        // 5. Scaled width to 1000 UPEM
        const scaledWidth = Math.round(glyph.advanceWidth * (1000 / font.unitsPerEm));

        // Insert features into DB
        insertFeatureStmt.run([
          fontId,
          char,
          holes,
          hu[0], hu[1], hu[2], hu[3], hu[4], hu[5], hu[6],
          scaledWidth,
          packMask(mask) // Uint8Array BLOB (packed to 512 bytes)
        ]);
        
        extractedCount++;
      } catch (err) {
        // Skip characters not found or failed
      }
    }
    return extractedCount;
  }

  // 1. Download and parse web fonts (Google Fonts served via Bunny Fonts)
  for (const fontName of FONTS_TO_FETCH) {
    const fontFile = path.join(TEMP_DIR, `${fontName.replace(/ /g, '_')}.woff`);
    console.log(`Processing Bunny Font: ${fontName}...`);
    try {
      if (!fs.existsSync(fontFile)) {
        console.log(`Fetching CSS from Bunny Fonts for ${fontName}...`);
        const cssUrl = `https://fonts.bunny.net/css?family=${fontName.replace(/ /g, '+')}:400,400i,700,700i`;
        const cssContent = await downloadString(cssUrl);
        
        let urlMatch = cssContent.match(/url\((https:\/\/[^)]+\.woff)\)/);
        if (!urlMatch) {
          urlMatch = cssContent.match(/url\((https:\/\/[^)]+)\)/);
        }
        if (!urlMatch) {
            throw new Error('Could not find font URL in CSS');
        }
        
        let fontUrl = urlMatch[1];
        if (fontUrl.startsWith("'") || fontUrl.startsWith('"')) {
          fontUrl = fontUrl.slice(1, -1);
        }
        console.log(`Downloading ${fontName} font file...`);
        await downloadFile(fontUrl, fontFile);
      }
      
      const fontBuffer = fs.readFileSync(fontFile);
      const font = opentype.parse(
        fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength)
      );

      const lowerName = fontName.toLowerCase();
      const isBold = lowerName.includes("bold");
      const isItalic = lowerName.includes("italic") || lowerName.includes("oblique");

      const charsCount = insertFontData(fontName, isBold, isItalic, font);
      console.log(`Successfully processed Bunny Font ${fontName}: extracted ${charsCount} chars`);
    } catch (err) {
      console.error(`Error processing Bunny Font ${fontName}:`, err.message);
    }
  }

  // 2. Crawl Windows system fonts if on Windows
  if (process.platform === 'win32') {
    const winFontsDir = 'C:\\Windows\\Fonts';
    if (fs.existsSync(winFontsDir)) {
      console.log('Crawling Windows system fonts...');
      try {
        const files = fs.readdirSync(winFontsDir);
        for (const file of files) {
          if (file.toLowerCase().endsWith('.ttf') || file.toLowerCase().endsWith('.otf')) {
            const fontPath = path.join(winFontsDir, file);
            try {
              const fontBuffer = fs.readFileSync(fontPath);
              const font = opentype.parse(
                fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength)
              );
              
              const platformNames = font.names.windows || font.names.macintosh;
              const fontFamily = platformNames 
                ? (platformNames.fontFamily ? (platformNames.fontFamily.en || Object.values(platformNames.fontFamily)[0]) : null) 
                : null;
              const fontSubfamily = platformNames 
                ? (platformNames.fontSubfamily ? (platformNames.fontSubfamily.en || Object.values(platformNames.fontSubfamily)[0]) : '') 
                : '';
              
              if (fontFamily) {
                let fullName = fontFamily;
                if (fontSubfamily && fontSubfamily.toLowerCase() !== 'regular') {
                  fullName = `${fontFamily} ${fontSubfamily}`;
                }
                
                // Skip if already processed in DB
                const checkRes = db.exec(`SELECT id FROM fonts WHERE family = '${fullName.replace(/'/g, "''")}';`);
                if (checkRes.length > 0 && checkRes[0].values.length > 0) {
                  continue;
                }
                
                console.log(`Processing local Windows font: ${fullName} (${file})...`);
                
                const lowerSub = fontSubfamily.toLowerCase();
                const isBold = lowerSub.includes("bold") || lowerSub.includes("heavy") || lowerSub.includes("black");
                const isItalic = lowerSub.includes("italic") || lowerSub.includes("oblique");

                const charsCount = insertFontData(fontFamily, isBold, isItalic, font);
                if (charsCount === 0) {
                  // Clean up font if no discriminator chars were successfully extracted
                  db.run(`DELETE FROM fonts WHERE family = '${fontFamily.replace(/'/g, "''")}';`);
                } else {
                  console.log(`Successfully processed local Windows font: ${fullName} (${charsCount} chars)`);
                }
              }
            } catch (e) {
              // skip unreadable font files
            }
          }
        }
      } catch (dirErr) {
        console.error('Error listing Windows fonts directory:', dirErr);
      }
    }
  }

  insertFontStmt.free();
  insertFeatureStmt.free();

  // Export DB and write to file
  const publicDir = path.dirname(OUT_DB_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const dbBytes = db.export();
  fs.writeFileSync(OUT_DB_FILE, Buffer.from(dbBytes));
  console.log(`\nSQLite Database written to ${OUT_DB_FILE} (size: ${dbBytes.length} bytes)`);

  // Copy sql-wasm.wasm to public directory
  try {
    const sqlWasmSrc = path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm');
    const sqlWasmDest = path.join(__dirname, '../public/sql-wasm.wasm');
    if (fs.existsSync(sqlWasmSrc)) {
      fs.copyFileSync(sqlWasmSrc, sqlWasmDest);
      console.log(`Copied sql-wasm.wasm from ${sqlWasmSrc} to ${sqlWasmDest}`);
    } else {
      console.warn(`Warning: sql-wasm.wasm not found at ${sqlWasmSrc}`);
    }
  } catch (err) {
    console.error("Failed to copy sql-wasm.wasm:", err.message);
  }
}

processFonts();

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

  console.log("Initializing SQLite...");
  const SQL = await initSqlJs();
  let db;

  if (fs.existsSync(OUT_DB_FILE)) {
    console.log(`Loading existing database from ${OUT_DB_FILE}...`);
    const fileBuffer = fs.readFileSync(OUT_DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    console.log("Creating new SQLite database...");
    db = new SQL.Database();
    
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

    db.run(`CREATE INDEX idx_features_char_holes ON font_features (char, holes);`);
    db.run(`CREATE INDEX idx_features_font_id ON font_features (font_id);`);
  }

  const insertFontStmt = db.prepare(`
    INSERT INTO fonts (family, is_bold, is_italic) VALUES (?, ?, ?);
  `);
  
  const insertFeatureStmt = db.prepare(`
    INSERT INTO font_features (font_id, char, holes, h1, h2, h3, h4, h5, h6, h7, width, raster_mask)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  function insertFontData(family, isBold, isItalic, font) {
    insertFontStmt.run([family, isBold ? 1 : 0, isItalic ? 1 : 0]);
    const fontId = db.exec("SELECT last_insert_rowid();")[0].values[0][0];

    let extractedCount = 0;
    for (const char of DISCRIMINATOR_CHARS) {
      try {
        const glyph = font.charToGlyph(char);
        const pathObj = glyph.getPath();
        const lines = getNormalizedLines(pathObj.commands);
        if (lines.length === 0) continue;
        
        const mask = rasterizeLines(lines);
        const holes = countHoles(mask);
        const hu = calculateHuMoments(mask, 64, 64);
        const scaledWidth = Math.round(glyph.advanceWidth * (1000 / font.unitsPerEm));

        insertFeatureStmt.run([
          fontId,
          char,
          holes,
          hu[0], hu[1], hu[2], hu[3], hu[4], hu[5], hu[6],
          scaledWidth,
          packMask(mask)
        ]);
        
        extractedCount++;
      } catch (err) {
        // Skip char on error
      }
    }
    return extractedCount;
  }

  // 1. Fetch the complete Bunny Fonts families list
  console.log("Fetching all Bunny Font families from API...");
  let bunnyList;
  try {
    const listData = await downloadString("https://fonts.bunny.net/list");
    bunnyList = JSON.parse(listData);
  } catch (err) {
    console.error("Failed to fetch Bunny Fonts list, using fallback:", err.message);
    bunnyList = {};
  }

  const fontFamilies = Object.keys(bunnyList);
  console.log(`Found ${fontFamilies.length} families on Bunny Fonts.`);

  // Write all family names to a JSON file for the manual dropdown
  try {
    const sortedNames = Object.keys(bunnyList)
      .map(slug => bunnyList[slug].familyName)
      .filter(Boolean)
      .sort();
    const familiesDest = path.join(__dirname, '../src/lib/pdf/font-families.json');
    fs.writeFileSync(familiesDest, JSON.stringify(sortedNames, null, 2));
    console.log(`Saved ${sortedNames.length} font family names to ${familiesDest}`);
  } catch (err) {
    console.error("Failed to save font families JSON:", err.message);
  }

  // 2. Concurrently download and process the Bunny Fonts
  const CONCURRENCY = 25;
  const queue = [...fontFamilies];
  let processedCount = 0;
  let skippedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  async function downloadAndProcessWorker() {
    while (queue.length > 0) {
      const slug = queue.shift();
      if (!slug) break;

      const familyData = bunnyList[slug];
      const familyName = familyData.familyName || slug;

      try {
        const weights = familyData.weights || [400];
        const styles = familyData.styles || ['normal'];
        
        // Build the CSS request spec
        const specs = [];
        for (const w of weights) {
          if (styles.includes('normal')) specs.push(`${w}`);
          if (styles.includes('italic')) specs.push(`${w}i`);
        }
        const specStr = specs.join(',');
        const cssUrl = `https://fonts.bunny.net/css?family=${familyName.replace(/ /g, '+')}:${specStr}`;
        
        // Fetch CSS
        const cssContent = await downloadString(cssUrl);
        const fontFaces = cssContent.split('@font-face');
        
        for (let i = 1; i < fontFaces.length; i++) {
          const block = fontFaces[i];
          const styleMatch = block.match(/font-style:\s*([^;]+)/);
          const weightMatch = block.match(/font-weight:\s*([^;]+)/);
          
          // Find all url(...) blocks in this font-face block
          const urls = [...block.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].trim());
          // Find the one ending with .woff (or containing .woff but not .woff2)
          let fontUrl = urls.find(u => u.includes('.woff') && !u.includes('.woff2'));
          if (!fontUrl) continue; // If no WOFF url is found, skip this variant

          if (fontUrl.startsWith("'") || fontUrl.startsWith('"')) {
            fontUrl = fontUrl.slice(1, -1);
          }
          fontUrl = fontUrl.split(')')[0];

          // Subsetting filter: only index the latin subset to avoid duplicates
          if (!fontUrl.includes('-latin-')) {
            continue;
          }

          const style = styleMatch ? styleMatch[1].trim().toLowerCase() : 'normal';
          const weightStr = weightMatch ? weightMatch[1].trim() : '400';
          const weight = parseInt(weightStr, 10) || 400;
          const isItalic = style === 'italic' || style === 'oblique';
          const isBold = weight >= 600;

          // Check if this font variant is already in the DB
          const checkRes = db.exec(`SELECT id FROM fonts WHERE family = '${familyName.replace(/'/g, "''")}' AND is_bold = ${isBold ? 1 : 0} AND is_italic = ${isItalic ? 1 : 0};`);
          if (checkRes.length > 0 && checkRes[0].values.length > 0) {
            skippedCount++;
            continue;
          }

          const tempFontFile = path.join(TEMP_DIR, `${slug}_${weight}_${style}.woff`);
          
          if (!fs.existsSync(tempFontFile)) {
            await downloadFile(fontUrl, tempFontFile);
          }

          const fontBuffer = fs.readFileSync(tempFontFile);
          const font = opentype.parse(
            fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength)
          );

          const charsCount = insertFontData(familyName, isBold, isItalic, font);
          if (charsCount === 0) {
            db.run(`DELETE FROM fonts WHERE id = (SELECT last_insert_rowid());`);
          } else {
            successCount++;
          }
        }
      } catch (err) {
        errorCount++;
      }

      processedCount++;
      if (processedCount % 100 === 0 || processedCount === fontFamilies.length) {
        console.log(`[Progress] Processed ${processedCount}/${fontFamilies.length} fonts... (Success: ${successCount}, Skipped/Already Indexed: ${skippedCount}, Errors: ${errorCount})`);
      }
    }
  }

  console.log(`Starting worker pool with concurrency = ${CONCURRENCY}...`);
  const workers = Array.from({ length: CONCURRENCY }, () => downloadAndProcessWorker());
  await Promise.all(workers);
  console.log(`Completed Bunny Fonts crawl. Processed: ${processedCount}, Skipped/Already Indexed: ${skippedCount}, Successful additions: ${successCount}, Errors: ${errorCount}`);

  // 3. Crawl Windows system fonts if on Windows
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
                
                const lowerSub = fontSubfamily.toLowerCase();
                const isBold = lowerSub.includes("bold") || lowerSub.includes("heavy") || lowerSub.includes("black");
                const isItalic = lowerSub.includes("italic") || lowerSub.includes("oblique");

                const checkRes = db.exec(`SELECT id FROM fonts WHERE family = '${fontFamily.replace(/'/g, "''")}' AND is_bold = ${isBold ? 1 : 0} AND is_italic = ${isItalic ? 1 : 0};`);
                if (checkRes.length > 0 && checkRes[0].values.length > 0) {
                  continue;
                }

                const charsCount = insertFontData(fontFamily, isBold, isItalic, font);
                if (charsCount === 0) {
                  db.run(`DELETE FROM fonts WHERE id = (SELECT last_insert_rowid());`);
                }
              }
            } catch (e) {
              // skip unreadable
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

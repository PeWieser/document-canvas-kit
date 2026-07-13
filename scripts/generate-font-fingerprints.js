import fs from 'fs';
import path from 'path';
import https from 'https';
import opentype from 'opentype.js';

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

const GLYPHS = ['e', 'a', 'o', 'g', 'A'];
const TEMP_DIR = path.join(__dirname, '..', 'temp_fonts');
const OUT_FILE = path.join(__dirname, '..', 'public', 'font-fingerprints.json');

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

function calculatePathArea(commands) {
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;
  let area = 0;
  let steps = 10;

  function addLine(x1, y1, x2, y2) {
    area += (x1 * y2 - x2 * y1);
  }

  for (let cmd of commands) {
    if (cmd.type === 'M') {
      sx = cmd.x; sy = cmd.y;
      cx = sx; cy = sy;
    } else if (cmd.type === 'L') {
      addLine(cx, cy, cmd.x, cmd.y);
      cx = cmd.x; cy = cmd.y;
    } else if (cmd.type === 'Q') {
      let px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        let t = i / steps;
        let invT = 1 - t;
        let x = invT * invT * px + 2 * invT * t * cmd.x1 + t * t * cmd.x;
        let y = invT * invT * py + 2 * invT * t * cmd.y1 + t * t * cmd.y;
        addLine(cx, cy, x, y);
        cx = x; cy = y;
      }
    } else if (cmd.type === 'C') {
      let px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        let t = i / steps;
        let invT = 1 - t;
        let x = invT * invT * invT * px + 3 * invT * invT * t * cmd.x1 + 3 * invT * t * t * cmd.x2 + t * t * t * cmd.x;
        let y = invT * invT * invT * py + 3 * invT * invT * t * cmd.y1 + 3 * invT * t * t * cmd.y2 + t * t * t * cmd.y;
        addLine(cx, cy, x, y);
        cx = x; cy = y;
      }
    } else if (cmd.type === 'Z') {
      addLine(cx, cy, sx, sy);
      cx = sx; cy = sy;
    }
  }
  return Math.abs(area / 2);
}

async function processFonts() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  const fingerprints = {};

  // 1. Download and parse web fonts (Google Fonts served via Bunny Fonts)
  for (const fontName of FONTS_TO_FETCH) {
    const fontFile = path.join(TEMP_DIR, `${fontName.replace(/ /g, '_')}.woff`);
    console.log(`Processing ${fontName}...`);
    try {
      if (!fs.existsSync(fontFile)) {
        console.log(`Fetching CSS from Bunny Fonts for ${fontName}...`);
        const cssUrl = `https://fonts.bunny.net/css?family=${fontName.replace(/ /g, '+')}`;
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
      fingerprints[fontName] = {};

      for (const char of GLYPHS) {
        const glyph = font.charToGlyph(char);
        const pathObj = glyph.getPath();
        const bbox = glyph.getBoundingBox();
        const width = bbox.x2 - bbox.x1;
        const height = bbox.y2 - bbox.y1;
        
        let ratio = 0;
        let relArea = 0;
        let commandsCount = pathObj.commands.length;
        
        if (width > 0 && height > 0) {
          ratio = parseFloat((width / height).toFixed(4));
          const boundingBoxArea = width * height;
          const area = calculatePathArea(pathObj.commands);
          relArea = parseFloat((area / boundingBoxArea).toFixed(4));
        }

        fingerprints[fontName][char] = {
          r: ratio,
          a: relArea,
          c: commandsCount
        };
      }
      console.log(`Successfully processed ${fontName}`);
    } catch (err) {
      console.error(`Error processing ${fontName}:`, err.message);
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
          if (file.toLowerCase().endsWith('.ttf')) {
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
                
                // Skip if already processed
                if (fingerprints[fullName]) {
                  continue;
                }
                
                console.log(`Processing local Windows font: ${fullName} (${file})...`);
                fingerprints[fullName] = {};
                let successCount = 0;
                
                for (const char of GLYPHS) {
                  try {
                    const glyph = font.charToGlyph(char);
                    const pathObj = glyph.getPath();
                    const bbox = glyph.getBoundingBox();
                    const width = bbox.x2 - bbox.x1;
                    const height = bbox.y2 - bbox.y1;
                    
                    let ratio = 0;
                    let relArea = 0;
                    let commandsCount = pathObj.commands.length;
                    
                    if (width > 0 && height > 0) {
                      ratio = parseFloat((width / height).toFixed(4));
                      const boundingBoxArea = width * height;
                      const area = calculatePathArea(pathObj.commands);
                      relArea = parseFloat((area / boundingBoxArea).toFixed(4));
                    }
                    
                    fingerprints[fullName][char] = {
                      r: ratio,
                      a: relArea,
                      c: commandsCount
                    };
                    successCount++;
                  } catch {
                    // skip character if not found in font
                  }
                }
                
                if (successCount === 0) {
                  delete fingerprints[fullName];
                } else {
                  console.log(`Successfully processed local Windows font: ${fullName}`);
                }
              }
            } catch {
              // skip unreadable font files
            }
          }
        }
      } catch (dirErr) {
        console.error('Error listing Windows fonts directory:', dirErr);
      }
    }
  }

  // Ensure public dir exists
  const publicDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(fingerprints, null, 2));
  console.log(`Fingerprints written to ${OUT_FILE}`);
}

processFonts();

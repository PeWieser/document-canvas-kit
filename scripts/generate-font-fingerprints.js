import fs from 'fs';
import path from 'path';
import https from 'https';
import opentype from 'opentype.js';

const __dirname = import.meta.dirname;

const FONTS_TO_FETCH = [
  'Roboto',
  'Lato',
  'Open Sans',
  'Montserrat',
  'Oswald',
  'Source Sans Pro',
  'Ubuntu',
  'Merriweather',
  'Playfair Display',
  'Nunito',
  'Raleway',
  'PT Sans'
];

const GLYPHS = ['e', 'a', 'o', 'g', 'A'];
const TEMP_DIR = path.join(__dirname, '..', 'temp_fonts');
const OUT_FILE = path.join(__dirname, '..', 'public', 'font-fingerprints.json');

function downloadString(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
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
    https.get(url, (response) => {
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

  for (const fontName of FONTS_TO_FETCH) {
    const fontFile = path.join(TEMP_DIR, `${fontName.replace(/ /g, '_')}.ttf`);
    console.log(`Processing ${fontName}...`);
    try {
      if (!fs.existsSync(fontFile)) {
        console.log(`Fetching CSS for ${fontName}...`);
        const cssUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}`;
        const cssContent = await downloadString(cssUrl);
        
        const urlMatch = cssContent.match(/url\((https:\/\/[^)]+\.ttf)\)/);
        if (!urlMatch) {
            throw new Error('Could not find TTF url in CSS');
        }
        
        const ttfUrl = urlMatch[1];
        console.log(`Downloading ${fontName} TTF...`);
        await downloadFile(ttfUrl, fontFile);
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

  // Ensure public dir exists
  const publicDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(fingerprints));
  console.log(`Fingerprints written to ${OUT_FILE}`);
}

processFonts();

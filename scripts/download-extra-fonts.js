import fs from 'fs';
import path from 'path';
import https from 'https';

const __dirname = import.meta.dirname;
const DEST_DIR = path.join(__dirname, '..', 'custom_fonts');

const FONTS_TO_DOWNLOAD = [
  {
    name: 'Amiri-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/amiri/Amiri-Regular.ttf'
  },
  {
    name: 'Lobster-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lobster/Lobster-Regular.ttf'
  },
  {
    name: 'Pacifico-Regular.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf'
  }
];

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

async function main() {
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  console.log("Downloading extra open-source fonts to custom_fonts/...");
  for (const font of FONTS_TO_DOWNLOAD) {
    const destPath = path.join(DEST_DIR, font.name);
    if (fs.existsSync(destPath)) {
      console.log(`Font ${font.name} already exists. Skipping.`);
      continue;
    }
    try {
      console.log(`Downloading ${font.name} from ${font.url}...`);
      await downloadFile(font.url, destPath);
      console.log(`Successfully downloaded ${font.name}`);
    } catch (err) {
      console.error(`Failed to download ${font.name}:`, err.message);
    }
  }
  console.log("All downloads complete.");
}

main().catch(console.error);

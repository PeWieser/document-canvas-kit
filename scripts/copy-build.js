import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('.output/public');
const destDir = path.resolve('dist');

try {
  if (fs.existsSync(srcDir)) {
    // Clean old dist if it exists
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    // Copy .output/public to dist
    fs.cpSync(srcDir, destDir, { recursive: true });
    console.log('Successfully copied .output/public to dist for Cloudflare deployment compatibility.');
  } else {
    console.warn('.output/public does not exist. Skipping copy.');
  }
} catch (err) {
  console.error('Failed to copy build assets:', err);
}

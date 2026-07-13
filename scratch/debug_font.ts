import fs from 'fs';
import opentype from 'opentype.js';

const bytes = fs.readFileSync('C:/Windows/Fonts/arial.ttf');
const font = opentype.parse(new Uint8Array(bytes).buffer);

console.log("e index:", font.charToGlyphIndex("e"));
console.log("a index:", font.charToGlyphIndex("a"));
console.log("names:", font.names);

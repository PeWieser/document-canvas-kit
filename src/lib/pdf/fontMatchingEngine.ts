// Core Font Matching Engine
// Contains geometric normalization, scanline rasterization, topological hole counting, 
// Hu-Moments calculation, and validation metrics (IoU, MAE).

export interface PathCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Flattens Bézier curves and normalizes glyph contours to fit a 56x56 box
 * inside a standard 64x64 grid, centered at (32, 32).
 */
export function getNormalizedLines(commands: PathCommand[]): LineSegment[] {
  const lines: LineSegment[] = [];
  let cx = 0, cy = 0;
  let sx = 0, sy = 0;
  const steps = 10;

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      cx = cmd.x ?? 0;
      cy = cmd.y ?? 0;
      sx = cx;
      sy = cy;
    } else if (cmd.type === 'L') {
      const tx = cmd.x ?? 0;
      const ty = cmd.y ?? 0;
      lines.push({ x1: cx, y1: cy, x2: tx, y2: ty });
      cx = tx;
      cy = ty;
    } else if (cmd.type === 'Q') {
      const qx = cmd.x ?? 0;
      const qy = cmd.y ?? 0;
      const qx1 = cmd.x1 ?? 0;
      const qy1 = cmd.y1 ?? 0;
      let px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const x = invT * invT * px + 2 * invT * t * qx1 + t * t * qx;
        const y = invT * invT * py + 2 * invT * t * qy1 + t * t * qy;
        lines.push({ x1: cx, y1: cy, x2: x, y2: y });
        cx = x;
        cy = y;
      }
    } else if (cmd.type === 'C') {
      const cx_end = cmd.x ?? 0;
      const cy_end = cmd.y ?? 0;
      const cx1 = cmd.x1 ?? 0;
      const cy1 = cmd.y1 ?? 0;
      const cx2 = cmd.x2 ?? 0;
      const cy2 = cmd.y2 ?? 0;
      let px = cx, py = cy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const invT = 1 - t;
        const x = invT * invT * invT * px + 3 * invT * invT * t * cx1 + 3 * invT * t * t * cx2 + t * t * t * cx_end;
        const y = invT * invT * invT * py + 3 * invT * invT * t * cy1 + 3 * invT * t * t * cy2 + t * t * t * cy_end;
        lines.push({ x1: cx, y1: cy, x2: x, y2: y });
        cx = x;
        cy = y;
      }
    } else if (cmd.type === 'Z') {
      if (cx !== sx || cy !== sy) {
        lines.push({ x1: cx, y1: cy, x2: sx, y2: sy });
      }
      cx = sx;
      cy = sy;
    }
  }

  // Find bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const l of lines) {
    for (const x of [l.x1, l.x2]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    for (const y of [l.y1, l.y2]) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (lines.length === 0 || minX === Infinity || maxX === -Infinity || minY === Infinity || maxY === -Infinity) {
    return [];
  }

  const w = maxX - minX;
  const h = maxY - minY;
  if (w === 0 && h === 0) return [];

  const maxDim = Math.max(w, h);
  const scale = 56.0 / maxDim;

  const centerX = minX + w / 2;
  const centerY = minY + h / 2;

  // Center at (32, 32)
  return lines.map(l => ({
    x1: (l.x1 - centerX) * scale + 32,
    y1: (l.y1 - centerY) * scale + 32,
    x2: (l.x2 - centerX) * scale + 32,
    y2: (l.y2 - centerY) * scale + 32
  }));
}

/**
 * Scanline fill algorithm using the even-odd rule.
 * Renders normalized lines onto a 64x64 binary grid.
 */
export function rasterizeLines(lines: LineSegment[]): Uint8Array {
  const mask = new Uint8Array(64 * 64);
  if (lines.length === 0) return mask;

  for (let y = 0; y < 64; y++) {
    const scanY = y + 0.5;
    const intersections: number[] = [];

    for (const l of lines) {
      const yMin = Math.min(l.y1, l.y2);
      const yMax = Math.max(l.y1, l.y2);
      if (scanY >= yMin && scanY < yMax) {
        const t = (scanY - l.y1) / (l.y2 - l.y1);
        const intersectX = l.x1 + t * (l.x2 - l.x1);
        intersections.push(intersectX);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      if (i + 1 >= intersections.length) break;
      const xStart = Math.max(0, Math.ceil(intersections[i] - 0.5));
      const xEnd = Math.min(64, Math.ceil(intersections[i + 1] - 0.5));
      for (let x = xStart; x < xEnd; x++) {
        mask[y * 64 + x] = 1;
      }
    }
  }

  return mask;
}

/**
 * Counts closed inner contours (holes) in the binary mask using BFS flood-fill.
 */
export function countHoles(mask: Uint8Array): number {
  const width = 64;
  const height = 64;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Helper to visit a pixel if it's background and unvisited
  function visit(x: number, y: number) {
    const idx = y * width + x;
    if (mask[idx] === 0 && visited[idx] === 0) {
      visited[idx] = 1; // Mark as outside background
      queue.push(idx);
    }
  }

  // Initialize BFS from all border background pixels
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y);
    visit(width - 1, y);
  }

  // BFS to propagate "outside" status
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = Math.floor(idx / width);

    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }

  // Count unvisited background connected components
  let holes = 0;
  const holeQueue: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0 && visited[idx] === 0) {
        holes++;
        visited[idx] = 1;
        holeQueue.push(idx);
        let hHead = 0;

        while (hHead < holeQueue.length) {
          const hIdx = holeQueue[hHead++];
          const hx = hIdx % width;
          const hy = Math.floor(hIdx / width);

          const visitNeighbor = (nx: number, ny: number) => {
            const nIdx = ny * width + nx;
            if (mask[nIdx] === 0 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              holeQueue.push(nIdx);
            }
          };

          if (hx > 0) visitNeighbor(hx - 1, hy);
          if (hx < width - 1) visitNeighbor(hx + 1, hy);
          if (hy > 0) visitNeighbor(hx, hy - 1);
          if (hy < height - 1) visitNeighbor(hx, hy + 1);
        }
        holeQueue.length = 0;
      }
    }
  }

  return holes;
}

/**
 * Calculates the 7 invariants Hu-Moments for a binary mask.
 * Values are logarithmically transformed for Euclidean distance comparisons.
 */
export function calculateHuMoments(binaryMask: Uint8Array | Uint8ClampedArray, width = 64, height = 64): number[] {
  let m00 = 0, m10 = 0, m01 = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelValue = binaryMask[y * width + x] ? 1 : 0;
      m00 += pixelValue;
      m10 += x * pixelValue;
      m01 += y * pixelValue;
    }
  }

  if (m00 === 0) {
    return [0, 0, 0, 0, 0, 0, 0];
  }

  const cx = m10 / m00;
  const cy = m01 / m00;

  let mu20 = 0, mu02 = 0, mu11 = 0;
  let mu30 = 0, mu03 = 0, mu12 = 0, mu21 = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixelValue = binaryMask[y * width + x] ? 1 : 0;
      if (pixelValue === 0) continue;

      const dx = x - cx;
      const dy = y - cy;

      mu20 += (dx * dx) * pixelValue;
      mu02 += (dy * dy) * pixelValue;
      mu11 += (dx * dy) * pixelValue;

      mu30 += (dx * dx * dx) * pixelValue;
      mu03 += (dy * dy * dy) * pixelValue;
      mu12 += (dx * dy * dy) * pixelValue;
      mu21 += (dx * dx * dy) * pixelValue;
    }
  }

  const normalize = (mu: number, p: number, q: number) => mu / Math.pow(m00, 1 + (p + q) / 2);

  const n20 = normalize(mu20, 2, 0);
  const n02 = normalize(mu02, 0, 2);
  const n11 = normalize(mu11, 1, 1);

  const n30 = normalize(mu30, 3, 0);
  const n03 = normalize(mu03, 0, 3);
  const n12 = normalize(mu12, 1, 2);
  const n21 = normalize(mu21, 2, 1);

  const h1 = n20 + n02;
  const h2 = Math.pow((n20 - n02), 2) + 4 * Math.pow(n11, 2);
  const h3 = Math.pow((n30 - 3 * n12), 2) + Math.pow((3 * n21 - n03), 2);
  const h4 = Math.pow((n30 + n12), 2) + Math.pow((n21 + n03), 2);
  const h5 = (n30 - 3 * n12) * (n30 + n12) * (Math.pow((n30 + n12), 2) - 3 * Math.pow((n21 + n03), 2)) +
             (3 * n21 - n03) * (n21 + n03) * (3 * Math.pow((n30 + n12), 2) - Math.pow((n21 + n03), 2));
  const h6 = (n20 - n02) * (Math.pow((n30 + n12), 2) - Math.pow((n21 + n03), 2)) +
             4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 = (3 * n21 - n03) * (n30 + n12) * (Math.pow((n30 + n12), 2) - 3 * Math.pow((n21 + n03), 2)) -
             (n30 - 3 * n12) * (n21 + n03) * (3 * Math.pow((n30 + n12), 2) - Math.pow((n21 + n03), 2));

  const huMoments = [h1, h2, h3, h4, h5, h6, h7];

  return huMoments.map(h => {
    if (h === 0) return 0;
    return -1 * Math.sign(h) * Math.log10(Math.abs(h));
  });
}

/**
 * Packs a 4096-pixel Uint8Array binary mask into 512 bytes (8 pixels per byte).
 */
export function packMask(mask: Uint8Array): Uint8Array {
  const packed = new Uint8Array(512);
  for (let i = 0; i < 4096; i++) {
    if (mask[i]) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      packed[byteIdx] |= (1 << bitIdx);
    }
  }
  return packed;
}

/**
 * Unpacks a 512-byte Uint8Array into a 4096-pixel Uint8Array binary mask.
 */
export function unpackMask(packed: Uint8Array): Uint8Array {
  const mask = new Uint8Array(4096);
  const len = Math.min(packed.length * 8, 4096);
  for (let i = 0; i < len; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = i % 8;
    if ((packed[byteIdx] & (1 << bitIdx)) !== 0) {
      mask[i] = 1;
    }
  }
  return mask;
}

/**
 * Calculates the optical Intersection over Union (IoU) of two binary masks.
 */
export function calculateIoU(maskA: Uint8Array, maskB: Uint8Array): number {
  let intersection = 0;
  let union = 0;
  const len = Math.min(maskA.length, maskB.length);
  for (let i = 0; i < len; i++) {
    if (maskA[i] && maskB[i]) intersection++;
    if (maskA[i] || maskB[i]) union++;
  }
  return union === 0 ? 1.0 : intersection / union;
}

export interface MatchResult {
  family: string;
  isBold: boolean;
  isItalic: boolean;
  confidence: number;
}

/**
 * High-performance offline font matching function.
 * Matches fontBytes against the SQLite database using 3-stage pipeline:
 * 1. Topological Pruning (holes count matching)
 * 2. Geometric Hu-moments Euclidean distance (L2 norm) scoring
 * 3. Metric Tie-breaker (MAE of character advance widths)
 * 4. Optical Validation & Outlier Rejection (IoU check on all discriminator glyphs)
 */
export function matchFontUsingDb(
  db: any,
  fontBytes: Uint8Array,
  pdfWidths: Record<string, number>
): MatchResult | null {
  // 1. Parse font using opentype
  let font: opentype.Font;
  try {
    font = opentype.parse(fontBytes.buffer.slice(fontBytes.byteOffset, fontBytes.byteOffset + fontBytes.byteLength));
  } catch (err) {
    console.error("[MatchingEngine] Failed to parse font bytes with opentype:", err);
    return null;
  }

  // 2. Extract features for available discriminator characters
  const pdfChars: {
    char: string;
    holes: number;
    hu: number[];
    width: number;
    mask: Uint8Array;
  }[] = [];

  for (const char of DISCRIMINATOR_CHARS) {
    if (font.charToGlyphIndex(char) === 0) continue;
    try {
      const glyph = font.charToGlyph(char);
      const path = glyph.getPath();
      const lines = getNormalizedLines(path.commands);
      if (lines.length === 0) continue;
      const mask = rasterizeLines(lines);
      const holes = countHoles(mask);
      const hu = calculateHuMoments(mask, 64, 64);
      const scaledWidth = Math.round(glyph.advanceWidth * (1000 / font.unitsPerEm));

      pdfChars.push({
        char,
        holes,
        hu,
        width: scaledWidth,
        mask
      });
    } catch (err) {
      // Ignore character errors
    }
  }

  if (pdfChars.length === 0) {
    console.warn("[MatchingEngine] No testable discriminator characters found in subset font.");
    return null;
  }

  // 3. Topological Pruning & Hu-Moments Euclidean distance matching
  const candidateDistances: Record<number, { sum: number; count: number }> = {};

  for (const pdfChar of pdfChars) {
    try {
      // Query fonts in DB with same char and same holes
      const stmt = db.prepare(`
        SELECT font_id, h1, h2, h3, h4, h5, h6, h7
        FROM font_features
        WHERE char = ? AND holes = ?
      `);
      stmt.bind([pdfChar.char, pdfChar.holes]);

      while (stmt.step()) {
        const row = stmt.getAsObject();
        const fontId = row.font_id as number;
        const dbHu = [row.h1, row.h2, row.h3, row.h4, row.h5, row.h6, row.h7] as number[];

        let distSq = 0;
        for (let i = 0; i < 7; i++) {
          const diff = pdfChar.hu[i] - dbHu[i];
          distSq += diff * diff;
        }
        const dist = Math.sqrt(distSq);

        if (!candidateDistances[fontId]) {
          candidateDistances[fontId] = { sum: 0, count: 0 };
        }
        candidateDistances[fontId].sum += dist;
        candidateDistances[fontId].count += 1;
      }
      stmt.free();
    } catch (err) {
      console.error("[MatchingEngine] SQL error during Hu-Moments search:", err);
    }
  }

  const minCharsToMatch = Math.min(3, pdfChars.length);
  const candidates = Object.entries(candidateDistances)
    .map(([id, val]) => ({
      fontId: parseInt(id),
      avgDist: val.sum / val.count,
      count: val.count
    }))
    .filter(c => c.count >= minCharsToMatch)
    .sort((a, b) => a.avgDist - b.avgDist)
    .slice(0, 10);

  if (candidates.length === 0) {
    console.log("[MatchingEngine] No database candidates matched topological pruning.");
    return null;
  }

  // 4. Metric Tie-Breaker
  const candidatesWithMetrics: {
    fontId: number;
    avgDist: number;
    mae: number;
    family: string;
    isBold: boolean;
    isItalic: boolean;
  }[] = [];

  for (const cand of candidates) {
    try {
      // Get font metadata
      let family = "Unknown";
      let isBold = false;
      let isItalic = false;

      let stmt = db.prepare("SELECT family, is_bold, is_italic FROM fonts WHERE id = ?");
      stmt.bind([cand.fontId]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        family = row.family as string;
        isBold = row.is_bold === 1;
        isItalic = row.is_italic === 1;
      }
      stmt.free();

      // Get DB widths for comparison
      const dbWidths: Record<string, number> = {};
      stmt = db.prepare("SELECT char, width FROM font_features WHERE font_id = ?");
      stmt.bind([cand.fontId]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        dbWidths[row.char as string] = row.width as number;
      }
      stmt.free();

      // Compute MAE of widths
      let totalError = 0;
      let comparedCount = 0;
      for (const char of Object.keys(pdfWidths)) {
        const expectedWidth = pdfWidths[char];
        const dbWidth = dbWidths[char];
        if (dbWidth !== undefined) {
          totalError += Math.abs(expectedWidth - dbWidth);
          comparedCount++;
        }
      }

      const mae = comparedCount > 0 ? totalError / comparedCount : Infinity;
      candidatesWithMetrics.push({
        fontId: cand.fontId,
        avgDist: cand.avgDist,
        mae,
        family,
        isBold,
        isItalic
      });
    } catch (err) {
      console.error("[MatchingEngine] SQL error during metric tie-breaker:", err);
    }
  }

  // Sort by MAE ascending
  candidatesWithMetrics.sort((a, b) => a.mae - b.mae);

  // 5. Validation & Outlier Rejection
  for (const cand of candidatesWithMetrics) {
    try {
      // Get DB raster masks for the candidate
      const dbMasks: Record<string, Uint8Array> = {};
      const dbWidths: Record<string, number> = {};
      const stmt = db.prepare("SELECT char, raster_mask, width FROM font_features WHERE font_id = ?");
      stmt.bind([cand.fontId]);
      while (stmt.step()) {
        const row = stmt.getAsObject();
        dbMasks[row.char as string] = unpackMask(row.raster_mask as Uint8Array);
        dbWidths[row.char as string] = row.width as number;
      }
      stmt.free();

      let totalIoU = 0;
      let testedChars = 0;
      let outliersCount = 0;

      for (const pdfChar of pdfChars) {
        const dbMask = dbMasks[pdfChar.char];
        const dbWidth = dbWidths[pdfChar.char];
        if (!dbMask || dbWidth === undefined) {
          // Missing glyph in candidate font is a severe outlier
          outliersCount++;
          continue;
        }

        const widthDelta = Math.abs(pdfChar.width - dbWidth);
        if (widthDelta > 15) {
          outliersCount++;
          continue;
        }

        const iou = calculateIoU(pdfChar.mask, dbMask);
        if (iou < 0.85) {
          outliersCount++;
          continue;
        }

        totalIoU += iou;
        testedChars++;
      }

      if (testedChars === 0) continue;
      const averageIoU = totalIoU / testedChars;

      if (outliersCount === 0 && averageIoU >= 0.95) {
        console.log(`[MatchingEngine] Font matched successfully: ${cand.family} (avg IoU: ${averageIoU.toFixed(3)})`);
        return {
          family: cand.family,
          isBold: cand.isBold,
          isItalic: cand.isItalic,
          confidence: averageIoU
        };
      } else {
        console.log(`[MatchingEngine] Candidate ${cand.family} rejected. Outliers: ${outliersCount}, avg IoU: ${averageIoU.toFixed(3)}`);
      }
    } catch (err) {
      console.error("[MatchingEngine] SQL error during validation:", err);
    }
  }

  console.log("[MatchingEngine] All candidates failed validation.");
  return null;
}



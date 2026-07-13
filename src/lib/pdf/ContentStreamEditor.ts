type TokenType =
  | "Whitespace"
  | "Comment"
  | "String"
  | "HexString"
  | "Name"
  | "ArrayStart"
  | "ArrayEnd"
  | "DictStart"
  | "DictEnd"
  | "Number"
  | "Operator";

export interface Token {
  type: TokenType;
  raw: Uint8Array;
  text?: string;
}

// Minimal overlap ratio required to redact a character (both horizontally and vertically)
// Default is 0.50 (50%). Change this value to adjust the redaction sensitivity.
export const REDACTION_OVERLAP_THRESHOLD = 0.5;

export interface GraphicsState {
  ctm: number[];
  ctmStack: number[][];
  tm: number[];
  tlm: number[];
  leading: number;
  fontSize: number;
}

export function createInitialGraphicsState(): GraphicsState {
  return {
    ctm: [1, 0, 0, 1, 0, 0],
    ctmStack: [],
    tm: [1, 0, 0, 1, 0, 0],
    tlm: [1, 0, 0, 1, 0, 0],
    leading: 0,
    fontSize: 10,
  };
}

export function tokenizeStream(data: Uint8Array): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const isWS = (b: number) =>
    b === 0x00 || b === 0x09 || b === 0x0a || b === 0x0c || b === 0x0d || b === 0x20;
  const isDelim = (b: number) =>
    b === 0x28 ||
    b === 0x29 ||
    b === 0x3c ||
    b === 0x3e ||
    b === 0x5b ||
    b === 0x5d ||
    b === 0x7b ||
    b === 0x7d ||
    b === 0x2f ||
    b === 0x25;

  while (i < data.length) {
    if (isWS(data[i])) {
      let start = i;
      while (i < data.length && isWS(data[i])) i++;
      tokens.push({ type: "Whitespace", raw: data.slice(start, i) });
      continue;
    }

    if (data[i] === 0x25) {
      // %
      let start = i;
      while (i < data.length && data[i] !== 0x0a && data[i] !== 0x0d) i++;
      tokens.push({ type: "Comment", raw: data.slice(start, i) });
      continue;
    }

    if (data[i] === 0x28) {
      // (
      let start = i;
      let depth = 1;
      i++;
      while (i < data.length && depth > 0) {
        if (data[i] === 0x5c)
          i += 2; // escape \
        else {
          if (data[i] === 0x28) depth++;
          else if (data[i] === 0x29) depth--;
          i++;
        }
      }
      tokens.push({ type: "String", raw: data.slice(start, i) });
      continue;
    }

    if (data[i] === 0x3c) {
      // <
      if (i + 1 < data.length && data[i + 1] === 0x3c) {
        // <<
        tokens.push({ type: "DictStart", raw: data.slice(i, i + 2) });
        i += 2;
      } else {
        let start = i;
        i++;
        while (i < data.length && data[i] !== 0x3e) i++; // >
        if (i < data.length) i++;
        tokens.push({ type: "HexString", raw: data.slice(start, i) });
      }
      continue;
    }

    if (data[i] === 0x3e && i + 1 < data.length && data[i + 1] === 0x3e) {
      // >>
      tokens.push({ type: "DictEnd", raw: data.slice(i, i + 2) });
      i += 2;
      continue;
    }

    if (data[i] === 0x5b) {
      tokens.push({ type: "ArrayStart", raw: data.slice(i, i + 1) });
      i++;
      continue;
    }
    if (data[i] === 0x5d) {
      tokens.push({ type: "ArrayEnd", raw: data.slice(i, i + 1) });
      i++;
      continue;
    }

    if (data[i] === 0x2f) {
      // /Name
      let start = i;
      i++;
      while (i < data.length && !isWS(data[i]) && !isDelim(data[i])) i++;
      tokens.push({ type: "Name", raw: data.slice(start, i) });
      continue;
    }

    // Number or Operator
    let start = i;
    while (i < data.length && !isWS(data[i]) && !isDelim(data[i])) i++;
    const raw = data.slice(start, i);
    const text = new TextDecoder("latin1").decode(raw);
    const isNum = /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text);

    tokens.push({ type: isNum ? "Number" : "Operator", raw, text });
  }

  return tokens;
}

const multiply = (m1: number[], m2: number[]) => [
  m1[0] * m2[0] + m1[1] * m2[2],
  m1[0] * m2[1] + m1[1] * m2[3],
  m1[2] * m2[0] + m1[3] * m2[2],
  m1[2] * m2[1] + m1[3] * m2[3],
  m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
  m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
];

// Standard Helvetica glyph widths (1/1000 em units) for accurate proportional width distribution
const HELVETICA_WIDTHS: Record<string, number> = {
  " ": 278,
  "!": 278,
  '"': 355,
  "#": 556,
  $: 556,
  "%": 889,
  "&": 667,
  "'": 191,
  "(": 333,
  ")": 333,
  "*": 389,
  "+": 584,
  ",": 278,
  "-": 333,
  ".": 278,
  "/": 278,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  ":": 278,
  ";": 278,
  "<": 584,
  "=": 584,
  ">": 584,
  "?": 556,
  "@": 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  "[": 278,
  "\\": 278,
  "]": 278,
  "^": 469,
  _: 556,
  "`": 333,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  "{": 334,
  "|": 260,
  "}": 334,
  "~": 584,
};

function getCharWidthInGlyphUnits(char: string): number {
  return HELVETICA_WIDTHS[char] ?? 556;
}

function getCharFromBytes(bytes: number[]): string {
  if (bytes.length === 0) return "";
  if (bytes[0] === 0x5c) {
    // backslash '\'
    if (bytes.length > 1) {
      const next = bytes[1];
      if (next >= 0x30 && next <= 0x37) {
        // octal digit
        let octalStr = "";
        for (let i = 1; i < bytes.length; i++) {
          octalStr += String.fromCharCode(bytes[i]);
        }
        const val = parseInt(octalStr, 8);
        return String.fromCharCode(val);
      }
      if (next === 0x6e) return "\n";
      if (next === 0x72) return "\r";
      if (next === 0x74) return "\t";
      if (next === 0x62) return "\b";
      if (next === 0x66) return "\f";
      return String.fromCharCode(next);
    }
    return "";
  }
  return String.fromCharCode(bytes[0]);
}

function getPlainTextFromToken(token: Token): string {
  const raw = token.raw;
  if (token.type === "String") {
    let result = "";
    let k = 1;
    const end = raw.length - 1;
    const bytes: number[] = [];
    while (k < end) {
      const glyphBytes: number[] = [];
      if (raw[k] === 0x5c) {
        glyphBytes.push(raw[k]);
        k++;
        if (k < end) {
          glyphBytes.push(raw[k]);
          if (raw[k] >= 0x30 && raw[k] <= 0x37) {
            k++;
            if (k < end && raw[k] >= 0x30 && raw[k] <= 0x37) {
              glyphBytes.push(raw[k]);
              k++;
              if (k < end && raw[k] >= 0x30 && raw[k] <= 0x37) {
                glyphBytes.push(raw[k]);
                k++;
              }
            }
          } else {
            k++;
          }
        }
      } else {
        glyphBytes.push(raw[k]);
        k++;
      }
      bytes.push(getCharFromBytes(glyphBytes).charCodeAt(0));
    }

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      for (let i = 2; i < bytes.length - 1; i += 2) {
        const val = (bytes[i] << 8) | bytes[i + 1];
        result += String.fromCharCode(val);
      }
      return result;
    }
    for (let i = 0; i < bytes.length; i++) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }

  if (token.type === "HexString") {
    const hexChars: string[] = [];
    for (let k = 1; k < raw.length - 1; k++) {
      const c = String.fromCharCode(raw[k]);
      if (/[0-9a-fA-F]/.test(c)) hexChars.push(c);
    }

    let is2Byte = false;
    if (hexChars.length % 4 === 0) {
      let zeroHighBytes = 0;
      const totalGlyphs = hexChars.length / 4;
      for (let k = 0; k < hexChars.length; k += 4) {
        if (hexChars[k] === "0" && hexChars[k + 1] === "0") {
          zeroHighBytes++;
        }
      }
      if (zeroHighBytes / totalGlyphs > 0.7) {
        is2Byte = true;
      }
    }

    const step = is2Byte ? 4 : 2;
    let result = "";
    for (let k = 0; k < hexChars.length; k += step) {
      const slice = hexChars.slice(k, k + step).join("");
      const val = parseInt(slice, 16);
      result += String.fromCharCode(val);
    }
    return result;
  }

  return "";
}

interface MatchState {
  lastMatchedIndex: number;
  charOffset: number;
}

function alignStrings(opStr: string, fullStr: string): number[] {
  const mapping: number[] = [];
  let fullIdx = 0;
  for (let opIdx = 0; opIdx < opStr.length; opIdx++) {
    const opChar = opStr[opIdx];
    while (fullIdx < fullStr.length && fullStr[fullIdx] !== opChar && /\s/.test(fullStr[fullIdx])) {
      fullIdx++;
    }
    if (fullIdx < fullStr.length && fullStr[fullIdx] === opChar) {
      mapping.push(fullIdx);
      fullIdx++;
    } else {
      mapping.push(fullIdx < fullStr.length ? fullIdx : fullStr.length - 1);
      fullIdx++;
    }
  }
  return mapping;
}

function getExactCharWidths(
  opStr: string,
  redactedItems: any[] | undefined,
  x: number,
  y: number,
  fontSize: number,
  widthScale: number,
  matchState: MatchState,
) {
  const glyphWidths: number[] = [];
  const pageWidths: number[] = [];

  let bestK = -1;
  let minDistance = Infinity;

  if (redactedItems && redactedItems.length > 0) {
    for (let k = matchState.lastMatchedIndex; k < redactedItems.length; k++) {
      const item = redactedItems[k];
      if (item && Array.isArray(item.transform) && item.transform.length >= 6) {
        const dist = Math.hypot(x - item.transform[4], y - item.transform[5]);
        if (dist < minDistance) {
          minDistance = dist;
          bestK = k;
        }
        if (dist < 1.0) break;
      }
    }

    if (minDistance > 10.0) {
      for (let k = 0; k < redactedItems.length; k++) {
        const item = redactedItems[k];
        if (item && Array.isArray(item.transform) && item.transform.length >= 6) {
          const dist = Math.hypot(x - item.transform[4], y - item.transform[5]);
          if (dist < minDistance) {
            minDistance = dist;
            bestK = k;
          }
        }
      }
    }

    if (bestK !== -1 && minDistance < 30.0) {
      const collectedItems: any[] = [];
      let fullStr = "";
      const itemMap: { item: any; itemIndex: number; charIdx: number }[] = [];

      let currK = bestK;
      let currOffset = bestK === matchState.lastMatchedIndex ? matchState.charOffset : 0;

      while (currK < redactedItems.length) {
        const item = redactedItems[currK];
        if (!item || !Array.isArray(item.transform) || item.transform.length < 6) {
          currK++;
          currOffset = 0;
          continue;
        }

        const itemStr = item.str || "";
        for (let idx = currOffset; idx < itemStr.length; idx++) {
          fullStr += itemStr[idx];
          itemMap.push({ item, itemIndex: currK, charIdx: idx });
        }

        collectedItems.push(item);

        const nonWsFull = fullStr.replace(/\s+/g, "").length;
        const nonWsOp = opStr.replace(/\s+/g, "").length;
        if (nonWsFull >= nonWsOp) {
          break;
        }

        currK++;
        currOffset = 0;
      }

      if (itemMap.length > 0) {
        const mapping = alignStrings(opStr, fullStr);
        const totalWeights = new Map<any, number>();
        const itemWeights = new Map<any, number[]>();

        for (const item of collectedItems) {
          const s = item.str || "";
          const wArr: number[] = [];
          let totalW = 0;
          for (let i = 0; i < s.length; i++) {
            const w = getCharWidthInGlyphUnits(s[i]);
            wArr.push(w);
            totalW += w;
          }
          if (totalW === 0) totalW = 1;
          totalWeights.set(item, totalW);
          itemWeights.set(item, wArr);
        }

        let lastMappedK = bestK;
        let lastMappedOffset = currOffset;

        for (let i = 0; i < opStr.length; i++) {
          const fullIdx = mapping[i];
          const mapInfo = itemMap[fullIdx] || itemMap[itemMap.length - 1];
          const item = mapInfo.item;
          const charIdxInItem = mapInfo.charIdx;

          lastMappedK = mapInfo.itemIndex;
          lastMappedOffset = charIdxInItem + 1;

          const transform = item.transform;
          const scaleX = Math.sqrt(transform[0] * transform[0] + transform[1] * transform[1]);
          const glyphSpaceWidth = (item.width / (scaleX || 1)) * 1000;

          const weights = itemWeights.get(item)!;
          const totalW = totalWeights.get(item)!;
          const w = weights[charIdxInItem] || 550;

          const charGlyphWidth = glyphSpaceWidth * (w / totalW);
          const charPageWidth = item.width * (w / totalW);

          glyphWidths.push(charGlyphWidth);
          pageWidths.push(charPageWidth);
        }

        // Compute per-character user-space bounds from PDF.js item positions.
        // These are anchored to each item's exact transform, eliminating
        // cumulative position drift from estimated character widths.
        const charUserBounds: { xMin: number; xMax: number; yMin: number; yMax: number }[] = [];
        const itemCumulativeWeights = new Map<any, number[]>();
        for (const cItem of collectedItems) {
          const ws = itemWeights.get(cItem)!;
          const cumulative: number[] = [0];
          for (let ci = 0; ci < ws.length; ci++) {
            cumulative.push(cumulative[ci] + ws[ci]);
          }
          itemCumulativeWeights.set(cItem, cumulative);
        }

        for (let bi = 0; bi < opStr.length; bi++) {
          const bFullIdx = mapping[bi];
          const bMapInfo = itemMap[bFullIdx] || itemMap[itemMap.length - 1];
          const bItem = bMapInfo.item;
          const bCharIdx = bMapInfo.charIdx;

          const bTransform = bItem.transform;
          const bItemW = bItem.width;
          const bTotalW = totalWeights.get(bItem)!;
          const bCumW = itemCumulativeWeights.get(bItem)!;

          const fracBefore = bCumW[bCharIdx] / bTotalW;
          const fracEnd = (bCumW[bCharIdx + 1] ?? bTotalW) / bTotalW;

          // Text direction unit vector
          const bScaleX = Math.sqrt(bTransform[0] * bTransform[0] + bTransform[1] * bTransform[1]);
          const cosA = bScaleX > 0 ? bTransform[0] / bScaleX : 1;
          const sinA = bScaleX > 0 ? bTransform[1] / bScaleX : 0;

          // Character start/end along writing direction (user space)
          const xOff0 = fracBefore * bItemW;
          const xOff1 = fracEnd * bItemW;

          // Bottom corners (baseline)
          const bx0 = bTransform[4] + xOff0 * cosA;
          const by0 = bTransform[5] + xOff0 * sinA;
          const bx1 = bTransform[4] + xOff1 * cosA;
          const by1 = bTransform[5] + xOff1 * sinA;

          // Height direction from text transform
          const hx = bTransform[2];
          const hy = bTransform[3];

          charUserBounds.push({
            xMin: Math.min(bx0, bx1, bx0 + hx, bx1 + hx),
            xMax: Math.max(bx0, bx1, bx0 + hx, bx1 + hx),
            yMin: Math.min(by0, by1, by0 + hy, by1 + hy),
            yMax: Math.max(by0, by1, by0 + hy, by1 + hy),
          });
        }

        matchState.lastMatchedIndex = lastMappedK;
        const itemStr = redactedItems[lastMappedK]?.str || "";
        if (lastMappedOffset >= itemStr.length) {
          matchState.lastMatchedIndex = lastMappedK + 1;
          matchState.charOffset = 0;
        } else {
          matchState.charOffset = lastMappedOffset;
        }

        return { glyphWidths, pageWidths, charUserBounds };
      }
    }
  }

  for (let i = 0; i < opStr.length; i++) {
    const char = opStr[i];
    const w = getCharWidthInGlyphUnits(char);
    glyphWidths.push(w);
    pageWidths.push(fontSize * (w / 1000) * widthScale);
  }
  return { glyphWidths, pageWidths, charUserBounds: undefined };
}

function redactStringTokenToTokens(
  token: Token,
  tm: number[],
  ctm: number[],
  fontSize: number,
  redactionRects: { x: number; y: number; x2: number; y2: number }[],
  glyphWidths: number[],
  charUserBounds?: { xMin: number; xMax: number; yMin: number; yMax: number }[],
): Token[] {
  const raw = token.raw;
  const end = raw.length - 1;
  let k = 1;
  const parsedBytes: number[] = [];
  const byteToRawIdx: number[] = [];

  while (k < end) {
    const startK = k;
    if (raw[k] === 0x5c) {
      k++;
      if (k < end) {
        if (raw[k] >= 0x30 && raw[k] <= 0x37) {
          let octalStr = String.fromCharCode(raw[k]);
          k++;
          if (k < end && raw[k] >= 0x30 && raw[k] <= 0x37) {
            octalStr += String.fromCharCode(raw[k]);
            k++;
            if (k < end && raw[k] >= 0x30 && raw[k] <= 0x37) {
              octalStr += String.fromCharCode(raw[k]);
              k++;
            }
          }
          parsedBytes.push(parseInt(octalStr, 8));
        } else {
          const next = raw[k];
          if (next === 0x6e) parsedBytes.push(0x0a);
          else if (next === 0x72) parsedBytes.push(0x0d);
          else if (next === 0x74) parsedBytes.push(0x09);
          else if (next === 0x62) parsedBytes.push(0x08);
          else if (next === 0x66) parsedBytes.push(0x0c);
          else parsedBytes.push(next);
          k++;
        }
      }
    } else {
      parsedBytes.push(raw[k]);
      k++;
    }
    for (let b = parsedBytes.length - 1; b < parsedBytes.length; b++) {
      byteToRawIdx.push(startK);
    }
  }

  let is2Byte = false;
  let startByteIdx = 0;
  if (parsedBytes.length >= 2 && parsedBytes[0] === 0xfe && parsedBytes[1] === 0xff) {
    is2Byte = true;
    startByteIdx = 2;
  } else if (glyphWidths.length === parsedBytes.length / 2) {
    is2Byte = true;
  }

  const step = is2Byte ? 2 : 1;
  let charTextSpaceX = 0;
  let charIdx = 0;

  const segments: (Token | number)[] = [];
  let currentStringBytes: number[] = [];
  let currentRedactedWidth = 0;

  const flushString = () => {
    if (currentStringBytes.length > 0) {
      segments.push({
        type: "String",
        raw: new Uint8Array([0x28, ...currentStringBytes, 0x29]),
      });
      currentStringBytes = [];
    }
  };

  const flushGap = () => {
    if (currentRedactedWidth > 0) {
      segments.push(-currentRedactedWidth);
      currentRedactedWidth = 0;
    }
  };

  if (is2Byte && startByteIdx === 2) {
    currentStringBytes.push(0xfe, 0xff);
  }

  const fsMatrix = [fontSize, 0, 0, fontSize, 0, 0];
  const trm = multiply(multiply(fsMatrix, tm), ctm);

  for (let bIdx = startByteIdx; bIdx < parsedBytes.length; bIdx += step) {
    const charGlyphWidth = glyphWidths[charIdx] || 550;
    const charTextSpaceWidth = charGlyphWidth / 1000;

    let textXMin: number, textXMax: number, textYMin: number, textYMax: number;

    if (charUserBounds && charUserBounds[charIdx]) {
      // Use pre-computed bounds from PDF.js item data (accurate, no cumulative drift)
      textXMin = charUserBounds[charIdx].xMin;
      textXMax = charUserBounds[charIdx].xMax;
      textYMin = charUserBounds[charIdx].yMin;
      textYMax = charUserBounds[charIdx].yMax;
    } else {
      // Fallback: compute from text rendering matrix
      const corners = [
        [charTextSpaceX, 0],
        [charTextSpaceX + charTextSpaceWidth, 0],
        [charTextSpaceX + charTextSpaceWidth, 1],
        [charTextSpaceX, 1],
      ];

      const userCorners = corners.map(([cx, cy]) => {
        return [cx * trm[0] + cy * trm[2] + trm[4], cx * trm[1] + cy * trm[3] + trm[5]];
      });

      textXMin = Math.min(...userCorners.map((c) => c[0]));
      textXMax = Math.max(...userCorners.map((c) => c[0]));
      textYMin = Math.min(...userCorners.map((c) => c[1]));
      textYMax = Math.max(...userCorners.map((c) => c[1]));
    }

    let isRedacted = false;
    for (const r of redactionRects) {
      const overlapL = Math.max(textXMin, r.x);
      const overlapR = Math.min(textXMax, r.x2);
      const overlapWidth = overlapR - overlapL;

      const overlapT = Math.max(textYMin, r.y);
      const overlapB = Math.min(textYMax, r.y2);
      const overlapHeight = overlapB - overlapT;

      if (overlapWidth > 0 && overlapHeight > 0) {
        const charArea = (textXMax - textXMin) * (textYMax - textYMin);
        const overlapArea = overlapWidth * overlapHeight;
        if (charArea > 0 && overlapArea / charArea >= REDACTION_OVERLAP_THRESHOLD) {
          isRedacted = true;
          break;
        }
      }
    }

    if (isRedacted) {
      flushString();
      currentRedactedWidth += charGlyphWidth;
    } else {
      flushGap();
      const rawStart = byteToRawIdx[bIdx];
      const rawEnd = bIdx + step < parsedBytes.length ? byteToRawIdx[bIdx + step] : end;
      for (let rIdx = rawStart; rIdx < rawEnd; rIdx++) {
        currentStringBytes.push(raw[rIdx]);
      }
    }

    charTextSpaceX += charTextSpaceWidth;
    charIdx++;
  }

  flushString();
  flushGap();

  const resultTokens: Token[] = [];
  for (const seg of segments) {
    if (typeof seg === "number") {
      const text = seg.toString();
      resultTokens.push({
        type: "Number",
        raw: new TextEncoder().encode(text),
        text,
      });
    } else {
      resultTokens.push(seg);
    }
  }

  return resultTokens;
}

function redactHexStringTokenToTokens(
  token: Token,
  tm: number[],
  ctm: number[],
  fontSize: number,
  redactionRects: { x: number; y: number; x2: number; y2: number }[],
  glyphWidths: number[],
  charUserBounds?: { xMin: number; xMax: number; yMin: number; yMax: number }[],
): Token[] {
  const raw = token.raw;
  const hexChars: string[] = [];
  for (let k = 1; k < raw.length - 1; k++) {
    const c = String.fromCharCode(raw[k]);
    if (/[0-9a-fA-F]/.test(c)) {
      hexChars.push(c);
    }
  }

  const is2Byte = glyphWidths.length === hexChars.length / 4;
  const step = is2Byte ? 4 : 2;
  let charTextSpaceX = 0;

  const segments: (Token | number)[] = [];
  let currentHexChars: string[] = [];
  let currentRedactedWidth = 0;
  let charIdx = 0;

  const flushHex = () => {
    if (currentHexChars.length > 0) {
      const newRawStr = `<${currentHexChars.join("")}>`;
      segments.push({
        type: "HexString",
        raw: new TextEncoder().encode(newRawStr),
      });
      currentHexChars = [];
    }
  };

  const flushGap = () => {
    if (currentRedactedWidth > 0) {
      const gapOffset = -currentRedactedWidth;
      segments.push(gapOffset);
      currentRedactedWidth = 0;
    }
  };

  const fsMatrix = [fontSize, 0, 0, fontSize, 0, 0];
  const trm = multiply(multiply(fsMatrix, tm), ctm);

  for (let k = 0; k < hexChars.length; k += step) {
    const slice = hexChars.slice(k, k + step).join("");
    const charGlyphWidth = glyphWidths[charIdx] || 550;
    const charTextSpaceWidth = charGlyphWidth / 1000;

    let textXMin: number, textXMax: number, textYMin: number, textYMax: number;

    if (charUserBounds && charUserBounds[charIdx]) {
      // Use pre-computed bounds from PDF.js item data (accurate, no cumulative drift)
      textXMin = charUserBounds[charIdx].xMin;
      textXMax = charUserBounds[charIdx].xMax;
      textYMin = charUserBounds[charIdx].yMin;
      textYMax = charUserBounds[charIdx].yMax;
    } else {
      // Fallback: compute from text rendering matrix
      const corners = [
        [charTextSpaceX, 0],
        [charTextSpaceX + charTextSpaceWidth, 0],
        [charTextSpaceX + charTextSpaceWidth, 1],
        [charTextSpaceX, 1],
      ];

      const userCorners = corners.map(([cx, cy]) => {
        return [cx * trm[0] + cy * trm[2] + trm[4], cx * trm[1] + cy * trm[3] + trm[5]];
      });

      textXMin = Math.min(...userCorners.map((c) => c[0]));
      textXMax = Math.max(...userCorners.map((c) => c[0]));
      textYMin = Math.min(...userCorners.map((c) => c[1]));
      textYMax = Math.max(...userCorners.map((c) => c[1]));
    }

    let isRedacted = false;
    for (const r of redactionRects) {
      const overlapL = Math.max(textXMin, r.x);
      const overlapR = Math.min(textXMax, r.x2);
      const overlapWidth = overlapR - overlapL;

      const overlapT = Math.max(textYMin, r.y);
      const overlapB = Math.min(textYMax, r.y2);
      const overlapHeight = overlapB - overlapT;

      if (overlapWidth > 0 && overlapHeight > 0) {
        const charArea = (textXMax - textXMin) * (textYMax - textYMin);
        const overlapArea = overlapWidth * overlapHeight;
        if (charArea > 0 && overlapArea / charArea >= REDACTION_OVERLAP_THRESHOLD) {
          isRedacted = true;
          break;
        }
      }
    }

    if (isRedacted) {
      flushHex();
      currentRedactedWidth += charGlyphWidth;
    } else {
      flushGap();
      currentHexChars.push(slice);
    }

    charTextSpaceX += charTextSpaceWidth;
    charIdx++;
  }

  flushHex();
  flushGap();

  const resultTokens: Token[] = [];
  for (const seg of segments) {
    if (typeof seg === "number") {
      const text = seg.toString();
      resultTokens.push({
        type: "Number",
        raw: new TextEncoder().encode(text),
        text,
      });
    } else {
      resultTokens.push(seg);
    }
  }

  return resultTokens;
}

export function filterRedactedText(
  tokens: Token[],
  redactionRects: { x: number; y: number; x2: number; y2: number }[],
  redactedItems: any[] | undefined,
  state: GraphicsState,
): Token[] {
  let { ctm, ctmStack, tm, tlm, leading, fontSize } = state;

  const filteredTokens: Token[] = [];
  const matchState: MatchState = { lastMatchedIndex: 0, charOffset: 0 };

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === "Operator") {
      const op = t.text;

      if (op === "q") {
        ctmStack.push([...ctm]);
      } else if (op === "Q") {
        if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      } else if (op === "cm") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 6) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 6) {
          ctm = multiply(nums, ctm);
        }
      } else if (op === "BT") {
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
      } else if (op === "Tm") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 6) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 6) {
          tm = nums;
          tlm = [...nums];
        }
      } else if (op === "Td" || op === "TD") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 2) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 2) {
          tlm[4] = nums[0] * tlm[0] + nums[1] * tlm[2] + tlm[4];
          tlm[5] = nums[0] * tlm[1] + nums[1] * tlm[3] + tlm[5];
          tm = [...tlm];
          if (op === "TD") {
            leading = -nums[1];
          }
        }
      } else if (op === "T*" || op === "'") {
        tlm[4] = 0 * tlm[0] + -leading * tlm[2] + tlm[4];
        tlm[5] = 0 * tlm[1] + -leading * tlm[3] + tlm[5];
        tm = [...tlm];
      } else if (op === '"') {
        tlm[4] = 0 * tlm[0] + -leading * tlm[2] + tlm[4];
        tlm[5] = 0 * tlm[1] + -leading * tlm[3] + tlm[5];
        tm = [...tlm];
      } else if (op === "TL") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 1) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 1) {
          leading = nums[0];
        }
      } else if (op === "Tf") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 1) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 1) {
          fontSize = nums[0];
        }
      }

      if (op === "Tj" || op === "TJ" || op === "'" || op === '"') {
        const x = tm[4] * ctm[0] + tm[5] * ctm[2] + ctm[4];
        const y = tm[4] * ctm[1] + tm[5] * ctm[3] + ctm[5];

        const widthScale =
          Math.sqrt(tm[0] * tm[0] + tm[1] * tm[1]) * Math.sqrt(ctm[0] * ctm[0] + ctm[1] * ctm[1]);

        let j = filteredTokens.length - 1;
        while (
          j >= 0 &&
          (filteredTokens[j].type === "Whitespace" || filteredTokens[j].type === "Comment")
        ) {
          j--;
        }

        if (j >= 0) {
          let opStr = "";
          if (op === "Tj" || op === "'" || op === '"') {
            opStr = getPlainTextFromToken(filteredTokens[j]);
          } else if (op === "TJ" && filteredTokens[j].type === "ArrayEnd") {
            let depth = 1;
            let idx = j - 1;
            while (idx >= 0 && depth > 0) {
              if (filteredTokens[idx].type === "ArrayEnd") depth++;
              else if (filteredTokens[idx].type === "ArrayStart") depth--;
              idx--;
            }
            const arrayStartIndex = idx + 1;
            for (let k = arrayStartIndex + 1; k < j; k++) {
              const subToken = filteredTokens[k];
              if (subToken.type === "String" || subToken.type === "HexString") {
                opStr += getPlainTextFromToken(subToken);
              }
            }
          }

          const { glyphWidths, charUserBounds } = getExactCharWidths(
            opStr,
            redactedItems,
            x,
            y,
            fontSize,
            widthScale,
            matchState,
          );

          if (op === "Tj" || op === "'" || op === '"') {
            const operandToken = filteredTokens[j];
            let subTokens: Token[] = [];
            if (operandToken.type === "String") {
              subTokens = redactStringTokenToTokens(
                operandToken,
                tm,
                ctm,
                fontSize,
                redactionRects,
                glyphWidths,
                charUserBounds,
              );
            } else if (operandToken.type === "HexString") {
              subTokens = redactHexStringTokenToTokens(
                operandToken,
                tm,
                ctm,
                fontSize,
                redactionRects,
                glyphWidths,
                charUserBounds,
              );
            }

            if (subTokens.length > 0) {
              filteredTokens.splice(j, 1);

              const arrayTokens: Token[] = [
                { type: "ArrayStart", raw: new Uint8Array([0x5b]) },
                ...subTokens,
                { type: "ArrayEnd", raw: new Uint8Array([0x5d]) },
              ];

              if (op === "'" || op === '"') {
                filteredTokens.push({
                  type: "Operator",
                  raw: new TextEncoder().encode("T*"),
                  text: "T*",
                });
                filteredTokens.push({ type: "Whitespace", raw: new Uint8Array([0x0a]) });
              }

              filteredTokens.push(...arrayTokens);
              t.text = "TJ";
              t.raw = new TextEncoder().encode("TJ");
            }

            const totalGlyphWidth = glyphWidths.reduce((sum, w) => sum + w, 0);
            tm[4] += (totalGlyphWidth / 1000) * fontSize * tm[0];
            tm[5] += (totalGlyphWidth / 1000) * fontSize * tm[1];
          } else if (op === "TJ" && filteredTokens[j].type === "ArrayEnd") {
            let depth = 1;
            let idx = j - 1;
            while (idx >= 0 && depth > 0) {
              if (filteredTokens[idx].type === "ArrayEnd") depth++;
              else if (filteredTokens[idx].type === "ArrayStart") depth--;
              idx--;
            }
            const arrayStartIndex = idx + 1;

            let charOffset = 0;
            const newArrayContent: Token[] = [];

            for (let k = arrayStartIndex + 1; k < j; k++) {
              const subToken = filteredTokens[k];
              if (subToken.type === "String" || subToken.type === "HexString") {
                const subStr = getPlainTextFromToken(subToken);
                const subLen = subStr.length;
                const subGlyphWidths = glyphWidths.slice(charOffset, charOffset + subLen);

                const subCharBounds = charUserBounds?.slice(charOffset, charOffset + subLen);
                let subTokens: Token[] = [];
                if (subToken.type === "String") {
                  subTokens = redactStringTokenToTokens(
                    subToken,
                    tm,
                    ctm,
                    fontSize,
                    redactionRects,
                    subGlyphWidths,
                    subCharBounds,
                  );
                } else {
                  subTokens = redactHexStringTokenToTokens(
                    subToken,
                    tm,
                    ctm,
                    fontSize,
                    redactionRects,
                    subGlyphWidths,
                    subCharBounds,
                  );
                }
                newArrayContent.push(...subTokens);

                const subGlyphWidthSum = subGlyphWidths.reduce((sum, w) => sum + w, 0);
                tm[4] += (subGlyphWidthSum / 1000) * fontSize * tm[0];
                tm[5] += (subGlyphWidthSum / 1000) * fontSize * tm[1];

                charOffset += subLen;
              } else {
                newArrayContent.push(subToken);
                if (subToken.type === "Number") {
                  const num = parseFloat(subToken.text!);
                  tm[4] -= (num / 1000) * fontSize * tm[0];
                  tm[5] -= (num / 1000) * fontSize * tm[1];
                }
              }
            }

            const deleteCount = j - arrayStartIndex + 1;
            filteredTokens.splice(arrayStartIndex, deleteCount);

            filteredTokens.push({ type: "ArrayStart", raw: new Uint8Array([0x5b]) });
            filteredTokens.push(...newArrayContent);
            filteredTokens.push({ type: "ArrayEnd", raw: new Uint8Array([0x5d]) });
          }
        }
      }
    }

    filteredTokens.push(t);
    i++;
  }

  state.ctm = ctm;
  state.ctmStack = ctmStack;
  state.tm = tm;
  state.tlm = tlm;
  state.leading = leading;
  state.fontSize = fontSize;

  return filteredTokens;
}

export function serializeTokens(tokens: Token[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (const t of tokens) {
    chunks.push(t.raw);
    totalLength += t.raw.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

export interface ShapeObject {
  id: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  coordTokens: number[]; // indices of coordinate tokens
  paintToken: number; // index of paint token
}

export function extractShapeObjects(tokens: Token[]): ShapeObject[] {
  const shapes: ShapeObject[] = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];

  let currentCoords: number[] = [];
  let currentMinX = Infinity,
    currentMinY = Infinity,
    currentMaxX = -Infinity,
    currentMaxY = -Infinity;

  const addPoint = (x: number, y: number, tokIndex1: number, tokIndex2: number) => {
    const tx = x * ctm[0] + y * ctm[2] + ctm[4];
    const ty = x * ctm[1] + y * ctm[3] + ctm[5];
    if (tx < currentMinX) currentMinX = tx;
    if (tx > currentMaxX) currentMaxX = tx;
    if (ty < currentMinY) currentMinY = ty;
    if (ty > currentMaxY) currentMaxY = ty;
    currentCoords.push(tokIndex1, tokIndex2);
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "Operator") {
      const op = t.text;
      if (op === "q") {
        ctmStack.push([...ctm]);
      } else if (op === "Q") {
        if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      } else if (op === "cm") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 6) {
          if (tokens[j].type === "Number") nums.unshift(parseFloat(tokens[j].text!));
          j--;
        }
        if (nums.length === 6) ctm = multiply(nums, ctm);
      } else if (op === "m" || op === "l") {
        const x = parseFloat(tokens[i - 2]?.text || "0");
        const y = parseFloat(tokens[i - 1]?.text || "0");
        if (!isNaN(x) && !isNaN(y)) addPoint(x, y, i - 2, i - 1);
      } else if (op === "c") {
        const x1 = parseFloat(tokens[i - 6]?.text || "0"),
          y1 = parseFloat(tokens[i - 5]?.text || "0");
        const x2 = parseFloat(tokens[i - 4]?.text || "0"),
          y2 = parseFloat(tokens[i - 3]?.text || "0");
        const x3 = parseFloat(tokens[i - 2]?.text || "0"),
          y3 = parseFloat(tokens[i - 1]?.text || "0");
        if (!isNaN(x1) && !isNaN(y1)) addPoint(x1, y1, i - 6, i - 5);
        if (!isNaN(x2) && !isNaN(y2)) addPoint(x2, y2, i - 4, i - 3);
        if (!isNaN(x3) && !isNaN(y3)) addPoint(x3, y3, i - 2, i - 1);
      } else if (op === "v" || op === "y") {
        const x2 = parseFloat(tokens[i - 4]?.text || "0"),
          y2 = parseFloat(tokens[i - 3]?.text || "0");
        const x3 = parseFloat(tokens[i - 2]?.text || "0"),
          y3 = parseFloat(tokens[i - 1]?.text || "0");
        if (!isNaN(x2) && !isNaN(y2)) addPoint(x2, y2, i - 4, i - 3);
        if (!isNaN(x3) && !isNaN(y3)) addPoint(x3, y3, i - 2, i - 1);
      } else if (op === "re") {
        const x = parseFloat(tokens[i - 4]?.text || "0"),
          y = parseFloat(tokens[i - 3]?.text || "0");
        const w = parseFloat(tokens[i - 2]?.text || "0"),
          h = parseFloat(tokens[i - 1]?.text || "0");
        if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h)) {
          addPoint(x, y, i - 4, i - 3);
          addPoint(x + w, y, -1, -1);
          addPoint(x, y + h, -1, -1);
          addPoint(x + w, y + h, -1, -1);
          currentCoords.push(i - 2, i - 1); // widths and heights for re
        }
      } else if (op && ["S", "s", "f", "F", "f*", "B", "B*", "b", "b*"].includes(op)) {
        if (currentCoords.length > 0) {
          shapes.push({
            id: crypto.randomUUID(),
            minX: currentMinX,
            minY: currentMinY,
            maxX: currentMaxX,
            maxY: currentMaxY,
            coordTokens: currentCoords.filter((idx) => idx !== -1),
            paintToken: i,
          });
          currentCoords = [];
          currentMinX = Infinity;
          currentMinY = Infinity;
          currentMaxX = -Infinity;
          currentMaxY = -Infinity;
        }
      } else if (op === "n" || op === "W" || op === "W*") {
        // n ends path without painting. W/W* are clipping paths.
        currentCoords = [];
        currentMinX = Infinity;
        currentMinY = Infinity;
        currentMaxX = -Infinity;
        currentMaxY = -Infinity;
      }
    }
  }

  return shapes;
}

export function transformShapeObjects(
  tokens: Token[],
  shapes: ShapeObject[],
  dx: number,
  dy: number,
  scaleX: number,
  scaleY: number,
  centerX: number,
  centerY: number,
): Token[] {
  const result = [...tokens];

  // We need to re-evaluate CTM to get the correct inversions at each point!
  // Since shapes store absolute token indices, we can iterate the tokens once and update when we hit a tracked index.

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];

  const getInverseDisplacement = (dxp: number, dyp: number, ctmArr: number[]) => {
    const det = ctmArr[0] * ctmArr[3] - ctmArr[1] * ctmArr[2];
    if (Math.abs(det) < 1e-6) return { dx: dxp, dy: dyp };
    return {
      dx: (ctmArr[3] * dxp - ctmArr[2] * dyp) / det,
      dy: (ctmArr[0] * dyp - ctmArr[1] * dxp) / det,
    };
  };

  const targetIndices = new Set<number>();
  shapes.forEach((s) => s.coordTokens.forEach((idx) => targetIndices.add(idx)));

  const updateNumToken = (
    index: number,
    valDelta: number,
    scaleFactor: number = 1,
    currentBase: number = 0,
  ) => {
    if (result[index] && result[index].type === "Number") {
      const current = parseFloat(result[index].text!);
      if (!isNaN(current)) {
        // current is in transformed coords? No, current is raw.
        // We add valDelta (which is in raw space)
        result[index] = {
          ...result[index],
          text: ((current - currentBase) * scaleFactor + currentBase + valDelta)
            .toFixed(4)
            .replace(/\.?0+$/, ""),
        };
      }
    }
  };

  for (let i = 0; i < result.length; i++) {
    const t = result[i];
    if (t.type === "Operator") {
      const op = t.text;
      if (op === "q") {
        ctmStack.push([...ctm]);
      } else if (op === "Q") {
        if (ctmStack.length > 0) ctm = ctmStack.pop()!;
      } else if (op === "cm") {
        let nums: number[] = [];
        let j = i - 1;
        while (j >= 0 && nums.length < 6) {
          if (result[j].type === "Number") nums.unshift(parseFloat(result[j].text!));
          j--;
        }
        if (nums.length === 6) ctm = multiply(nums, ctm);
      } else if (op === "m" || op === "l") {
        if (targetIndices.has(i - 2) && targetIndices.has(i - 1)) {
          // It's a tracked point
          const x = parseFloat(result[i - 2].text || "0");
          const y = parseFloat(result[i - 1].text || "0");
          // Absolute point:
          const ax = x * ctm[0] + y * ctm[2] + ctm[4];
          const ay = x * ctm[1] + y * ctm[3] + ctm[5];

          // Apply scale around center in absolute space, then translate
          const newAx = centerX + (ax - centerX) * scaleX + dx;
          const newAy = centerY + (ay - centerY) * scaleY + dy;

          // Delta in absolute space
          const dAx = newAx - ax;
          const dAy = newAy - ay;

          const inv = getInverseDisplacement(dAx, dAy, ctm);
          updateNumToken(i - 2, inv.dx);
          updateNumToken(i - 1, inv.dy);
        }
      } else if (op === "c" || op === "v" || op === "y") {
        const offsets = op === "c" ? [6, 4, 2] : [4, 2];
        for (const off of offsets) {
          if (targetIndices.has(i - off) && targetIndices.has(i - off + 1)) {
            const x = parseFloat(result[i - off].text || "0");
            const y = parseFloat(result[i - off + 1].text || "0");
            const ax = x * ctm[0] + y * ctm[2] + ctm[4];
            const ay = x * ctm[1] + y * ctm[3] + ctm[5];
            const newAx = centerX + (ax - centerX) * scaleX + dx;
            const newAy = centerY + (ay - centerY) * scaleY + dy;
            const inv = getInverseDisplacement(newAx - ax, newAy - ay, ctm);
            updateNumToken(i - off, inv.dx);
            updateNumToken(i - off + 1, inv.dy);
          }
        }
      } else if (op === "re") {
        if (
          targetIndices.has(i - 4) &&
          targetIndices.has(i - 3) &&
          targetIndices.has(i - 2) &&
          targetIndices.has(i - 1)
        ) {
          // x, y
          const x = parseFloat(result[i - 4].text || "0");
          const y = parseFloat(result[i - 3].text || "0");
          const ax = x * ctm[0] + y * ctm[2] + ctm[4];
          const ay = x * ctm[1] + y * ctm[3] + ctm[5];
          const newAx = centerX + (ax - centerX) * scaleX + dx;
          const newAy = centerY + (ay - centerY) * scaleY + dy;
          const inv = getInverseDisplacement(newAx - ax, newAy - ay, ctm);
          updateNumToken(i - 4, inv.dx);
          updateNumToken(i - 3, inv.dy);

          // width, height
          // scaling widths in raw space is tricky if CTM is rotated.
          // Assuming no major rotation or non-uniform scaling combined with rotation.
          // For re, we'll simply scale the width/height tokens.
          updateNumToken(i - 2, 0, scaleX, 0);
          updateNumToken(i - 1, 0, scaleY, 0);
        }
      }
    }
  }

  return result;
}

export function deleteShapeObjects(tokens: Token[], shapes: ShapeObject[]): Token[] {
  const result = [...tokens];
  shapes.forEach((s) => {
    if (result[s.paintToken] && result[s.paintToken].type === "Operator") {
      result[s.paintToken] = { type: "Operator", raw: new Uint8Array([0x6e]), text: "n" }; // replace paint with 'n'
    }
  });
  return result;
}

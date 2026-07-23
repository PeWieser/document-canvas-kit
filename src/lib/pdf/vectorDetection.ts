import type { Token } from "./ContentStreamEditor";
import { BoundingBox, VectorElement, VectorPathSegment } from "./types";

const VECTOR_PATH_OPS = new Set([
  "m", "l", "c", "v", "y", "h", "re",
  "S", "s", "f", "F", "f*", "B", "B*", "b", "b*"
]);

export function isVectorOperator(op: string): boolean {
  return VECTOR_PATH_OPS.has(op);
}

function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

export function detectVectorElements(tokens: Token[], pageNumber: number = 1): VectorElement[] {
  const elements: VectorElement[] = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  const ctmStack: number[][] = [];

  let currentSegments: VectorPathSegment[] = [];
  let currentCoordTokens: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let isClosed = false;
  let elementIndex = 0;

  const updateBounds = (pt: { x: number; y: number }) => {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  };

  const getPrecedingNumbers = (endIndex: number, count: number): { numbers: number[]; indices: number[] } => {
    const numbers: number[] = [];
    const indices: number[] = [];
    let j = endIndex - 1;
    while (j >= 0 && numbers.length < count) {
      if (tokens[j].type === "Number") {
        const num = parseFloat(tokens[j].text || "0");
        numbers.unshift(isNaN(num) ? 0 : num);
        indices.unshift(j);
      } else if (tokens[j].type !== "Whitespace" && tokens[j].type !== "Comment") {
        break;
      }
      j--;
    }
    return { numbers, indices };
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "Operator" || !t.text) continue;

    const op = t.text;

    if (op === "q") {
      ctmStack.push([...ctm]);
    } else if (op === "Q") {
      if (ctmStack.length > 0) ctm = ctmStack.pop()!;
    } else if (op === "cm") {
      const { numbers } = getPrecedingNumbers(i, 6);
      if (numbers.length === 6) {
        ctm = multiply(numbers, ctm);
      }
    } else if (op === "m" || op === "l") {
      const { numbers, indices } = getPrecedingNumbers(i, 2);
      if (numbers.length === 2) {
        const pt = {
          x: numbers[0] * ctm[0] + numbers[1] * ctm[2] + ctm[4],
          y: numbers[0] * ctm[1] + numbers[1] * ctm[3] + ctm[5],
        };
        updateBounds(pt);
        currentSegments.push({ op, points: [pt] });
        currentCoordTokens.push(...indices);
      }
    } else if (op === "c") {
      const { numbers, indices } = getPrecedingNumbers(i, 6);
      if (numbers.length === 6) {
        const p1 = { x: numbers[0] * ctm[0] + numbers[1] * ctm[2] + ctm[4], y: numbers[0] * ctm[1] + numbers[1] * ctm[3] + ctm[5] };
        const p2 = { x: numbers[2] * ctm[0] + numbers[3] * ctm[2] + ctm[4], y: numbers[2] * ctm[1] + numbers[3] * ctm[3] + ctm[5] };
        const p3 = { x: numbers[4] * ctm[0] + numbers[5] * ctm[2] + ctm[4], y: numbers[4] * ctm[1] + numbers[5] * ctm[3] + ctm[5] };
        updateBounds(p1);
        updateBounds(p2);
        updateBounds(p3);
        currentSegments.push({ op, points: [p1, p2, p3] });
        currentCoordTokens.push(...indices);
      }
    } else if (op === "v" || op === "y") {
      const { numbers, indices } = getPrecedingNumbers(i, 4);
      if (numbers.length === 4) {
        const p1 = { x: numbers[0] * ctm[0] + numbers[1] * ctm[2] + ctm[4], y: numbers[0] * ctm[1] + numbers[1] * ctm[3] + ctm[5] };
        const p2 = { x: numbers[2] * ctm[0] + numbers[3] * ctm[2] + ctm[4], y: numbers[2] * ctm[1] + numbers[3] * ctm[3] + ctm[5] };
        updateBounds(p1);
        updateBounds(p2);
        currentSegments.push({ op, points: [p1, p2] });
        currentCoordTokens.push(...indices);
      }
    } else if (op === "h") {
      isClosed = true;
      currentSegments.push({ op: "h", points: [] });
    } else if (op === "re") {
      const { numbers, indices } = getPrecedingNumbers(i, 4);
      if (numbers.length === 4) {
        const x = numbers[0], y = numbers[1], w = numbers[2], h = numbers[3];
        const corners = [
          { x: x * ctm[0] + y * ctm[2] + ctm[4], y: x * ctm[1] + y * ctm[3] + ctm[5] },
          { x: (x + w) * ctm[0] + y * ctm[2] + ctm[4], y: (x + w) * ctm[1] + y * ctm[3] + ctm[5] },
          { x: (x + w) * ctm[0] + (y + h) * ctm[2] + ctm[4], y: (x + w) * ctm[1] + (y + h) * ctm[3] + ctm[5] },
          { x: x * ctm[0] + (y + h) * ctm[2] + ctm[4], y: x * ctm[1] + (y + h) * ctm[3] + ctm[5] },
        ];
        corners.forEach(updateBounds);
        currentSegments.push({ op: "re", points: corners });
        currentCoordTokens.push(...indices);
        isClosed = true;
      }
    } else if (["S", "s", "f", "F", "f*", "B", "B*", "b", "b*"].includes(op)) {
      if (currentSegments.length > 0 && minX !== Infinity) {
        if (["s", "b", "b*"].includes(op)) isClosed = true;
        elementIndex++;
        elements.push({
          id: `vec-${pageNumber}-${elementIndex}`,
          page: pageNumber,
          bounds: { minX, minY, maxX, maxY },
          segments: currentSegments,
          coordTokens: currentCoordTokens,
          paintToken: i,
          closed: isClosed,
          zIndex: elementIndex,
        });
      }
      currentSegments = [];
      currentCoordTokens = [];
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      isClosed = false;
    } else if (op === "n" || op === "W" || op === "W*") {
      currentSegments = [];
      currentCoordTokens = [];
      minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
      isClosed = false;
    }
  }

  return elements;
}

export function extractVectorBounds(tokens: Token[]): BoundingBox[] {
  const elements = detectVectorElements(tokens);
  return elements.map((el) => el.bounds);
}

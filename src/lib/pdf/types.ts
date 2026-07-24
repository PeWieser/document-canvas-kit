import type { FontMetrics } from "./fontMetrics";

// All geometry is stored in PDF user space (points, origin bottom-left, y up),
// so annotations are zoom-independent and map 1:1 to pdf-lib on export.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Tool = "select" | "highlight" | "redact" | "edit-text" | "textbox" | "pen" | "comment" | "crop";

export type PenStyle = "solid" | "marker" | "pencil" | "dashed";

export type ViewMode = "fit-width" | "fit-height" | "two-page" | "custom";

export type AnnoColor = string; // hex

export interface HighlightAnno {
  id: string;
  kind: "highlight";
  page: number;
  rects: Rect[];
  color: AnnoColor;
}

export interface RedactAnno {
  id: string;
  kind: "redact";
  page: number;
  rect: Rect;
}

import type { TextRun, ParagraphStyle } from "./paragraphGroup";

export interface TextReplaceAnno {
  id: string;
  kind: "textReplace";
  page: number;
  rect: Rect; // region of original text to delete
  text: string;
  fontSize: number;
  color: AnnoColor;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
  paragraphSpacing?: number;
  runs?: TextRun[];
  style?: ParagraphStyle;
  transform?: number[];
  width?: number;
  lineHeight?: number;
  /** Raw bytes of the *original* embedded PDF font – reused on export
   *  so the replacement text uses identical glyph metrics (deckungsgleich). */
  originalFontBytes?: Uint8Array;
  weight?: number;
  italicAngle?: number;
  pdfFontMetrics?: FontMetrics | null;
  ascentRatio?: number;
}

export interface TextboxAnno {
  id: string;
  kind: "textbox";
  page: number;
  x: number;
  y: number; // top-left baseline anchor in PDF space (top edge)
  w: number;
  h: number;
  text: string;
  fontSize: number;
  color: AnnoColor;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignment?: "left" | "center" | "right" | "justify";
  paragraphSpacing?: number;
  runs?: TextRun[];
  style?: ParagraphStyle;
  transform?: number[];
}

export interface PenAnno {
  id: string;
  kind: "pen";
  page: number;
  points: [number, number][]; // PDF space
  color: AnnoColor;
  size: number;
  style?: PenStyle;
}

export interface CropAnno {
  id: string;
  kind: "crop";
  page: number;
  rect: Rect; // PDF-user-space crop window
  rotation?: number; // degrees, -45..+45
}

export interface CommentReply {
  id: string;
  text: string;
  ts: number;
}

export interface CommentAnno {
  id: string;
  kind: "comment";
  page: number;
  x: number;
  y: number;
  text: string;
  replies: CommentReply[];
  resolved: boolean;
}

// A moved / replaced raster image. `rect` is the target box in PDF space.
// `dataUrl` (optional) carries a replacement image drawn on export.
export interface ImageAnno {
  id: string;
  kind: "image";
  page: number;
  rect: Rect;
  dataUrl: string;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type HandlePosition = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotation";

export interface VectorPathSegment {
  op: string;
  points: { x: number; y: number }[];
}

export interface VectorElement {
  id: string;
  page: number;
  bounds: BoundingBox;
  segments: VectorPathSegment[];
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  rotation?: number;
  zIndex?: number;
  coordTokens?: number[];
  paintToken?: number;
  closed?: boolean;
}

export interface SnapGuide {
  id: string;
  type: "vertical" | "horizontal";
  position: number;
  kind?: "margin" | "center" | "element";
  start?: number;
  end?: number;
}

export interface SelectionState {
  selectedIds: string[];
  activeHandle: HandlePosition | null;
  dragStart?: { x: number; y: number };
  initialBounds?: Record<string, Rect | BoundingBox>;
  rotation?: number;
}

export type Annotation =
  | HighlightAnno
  | RedactAnno
  | TextReplaceAnno
  | TextboxAnno
  | PenAnno
  | CommentAnno
  | ImageAnno
  | CropAnno;


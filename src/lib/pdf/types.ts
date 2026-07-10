// All geometry is stored in PDF user space (points, origin bottom-left, y up),
// so annotations are zoom-independent and map 1:1 to pdf-lib on export.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Tool =
  | "select"
  | "highlight"
  | "redact"
  | "edit-text"
  | "textbox"
  | "pen"
  | "comment";

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
}

export interface PenAnno {
  id: string;
  kind: "pen";
  page: number;
  points: [number, number][]; // PDF space
  color: AnnoColor;
  size: number;
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

export type Annotation =
  | HighlightAnno
  | RedactAnno
  | TextReplaceAnno
  | TextboxAnno
  | PenAnno
  | CommentAnno
  | ImageAnno;

import { create } from "zustand";
import type { Annotation, Tool } from "@/lib/pdf/types";

interface Snapshot {
  annotations: Annotation[];
  pageOrder: number[];
}

interface EditorState {
  fileName: string | null;
  originalBytes: Uint8Array | null;
  numPages: number;
  pageOrder: number[]; // stable original page indices, in display order
  annotations: Annotation[];

  tool: Tool;
  color: string;
  highlightColor: string;
  fontSize: number;
  penSize: number;
  zoom: number;
  selectedId: string | null;
  gridOpen: boolean;

  past: Snapshot[];
  future: Snapshot[];

  loadDoc: (fileName: string, bytes: Uint8Array, numPages: number) => void;
  closeDoc: () => void;
  setTool: (t: Tool) => void;
  setColor: (c: string) => void;
  setHighlightColor: (c: string) => void;
  setFontSize: (n: number) => void;
  setPenSize: (n: number) => void;
  setZoom: (z: number) => void;
  setGridOpen: (b: boolean) => void;
  select: (id: string | null) => void;

  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;

  reorderPages: (from: number, to: number) => void;
  deletePage: (displayIndex: number) => void;

  undo: () => void;
  redo: () => void;
}

function snap(s: EditorState): Snapshot {
  return {
    annotations: s.annotations.map((a) => ({ ...a })),
    pageOrder: [...s.pageOrder],
  };
}

export const useEditor = create<EditorState>((set, get) => ({
  fileName: null,
  originalBytes: null,
  numPages: 0,
  pageOrder: [],
  annotations: [],

  tool: "select",
  color: "#111111",
  highlightColor: "#ffd54a",
  fontSize: 14,
  penSize: 3,
  zoom: 1.15,
  selectedId: null,
  gridOpen: false,

  past: [],
  future: [],

  loadDoc: (fileName, bytes, numPages) =>
    set({
      fileName,
      originalBytes: bytes,
      numPages,
      pageOrder: Array.from({ length: numPages }, (_, i) => i),
      annotations: [],
      past: [],
      future: [],
      selectedId: null,
      tool: "select",
    }),

  closeDoc: () =>
    set({
      fileName: null,
      originalBytes: null,
      numPages: 0,
      pageOrder: [],
      annotations: [],
      past: [],
      future: [],
      selectedId: null,
    }),

  setTool: (t) => set({ tool: t, selectedId: null }),
  setColor: (c) => set({ color: c }),
  setHighlightColor: (c) => set({ highlightColor: c }),
  setFontSize: (n) => set({ fontSize: n }),
  setPenSize: (n) => set({ penSize: n }),
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),
  setGridOpen: (b) => set({ gridOpen: b }),
  select: (id) => set({ selectedId: id }),

  addAnnotation: (a) => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
      annotations: [...s.annotations, a],
      selectedId: a.id,
    });
  },

  updateAnnotation: (id, patch) => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
      annotations: s.annotations.map((a) =>
        a.id === id ? ({ ...a, ...patch } as Annotation) : a,
      ),
    });
  },

  removeAnnotation: (id) => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    });
  },

  reorderPages: (from, to) => {
    const s = get();
    const order = [...s.pageOrder];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    set({ past: [...s.past, snap(s)], future: [], pageOrder: order });
  },

  deletePage: (displayIndex) => {
    const s = get();
    if (s.pageOrder.length <= 1) return;
    const pageId = s.pageOrder[displayIndex];
    set({
      past: [...s.past, snap(s)],
      future: [],
      pageOrder: s.pageOrder.filter((_, i) => i !== displayIndex),
      annotations: s.annotations.filter((a) => a.page !== pageId),
    });
  },

  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    set({
      past: s.past.slice(0, -1),
      future: [snap(s), ...s.future],
      annotations: previous.annotations,
      pageOrder: previous.pageOrder,
      selectedId: null,
    });
  },

  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    set({
      past: [...s.past, snap(s)],
      future: s.future.slice(1),
      annotations: next.annotations,
      pageOrder: next.pageOrder,
      selectedId: null,
    });
  },
}));

import { create } from "zustand";
import type { Annotation, Tool, ViewMode, PenStyle } from "@/lib/pdf/types";
import { clearGlobalFontCache } from "@/components/editor/PageView";

interface Snapshot {
  annotations: Annotation[];
  pageOrder: number[];
}

export interface PageSize {
  w: number;
  h: number;
}

interface EditorState {
  fileName: string | null;
  originalBytes: Uint8Array | null;
  fileHandle: FileSystemFileHandle | null;
  dirty: boolean;
  numPages: number;
  pageOrder: number[]; // stable original page indices, in display order
  annotations: Annotation[];

  tool: Tool;
  color: string;
  highlightColor: string;
  fontSize: number;
  penSize: number;
  penStyle: PenStyle;
  defaultFontFamily: string | null;
  zoom: number;
  viewMode: ViewMode;
  estimateSize: PageSize | null; // page-1 size in PDF points (scale 1)
  sidebarOpen: boolean;
  commentsPanelOpen: boolean;
  searchOpen: boolean;
  currentPage: number; // display index of the active page
  selectedId: string | null;
  selectedPages: number[]; // display indices selected in thumbnail rail
  gridOpen: boolean;
  fingerprints: any[];
  setFingerprints: (fps: any[]) => void;

  past: Snapshot[];
  future: Snapshot[];
  loadDoc: (
    fileName: string,
    bytes: Uint8Array,
    numPages: number,
    estimateSize: PageSize | null,
    handle?: FileSystemFileHandle | null,
  ) => void;
  closeDoc: () => void;
  setFileHandle: (h: FileSystemFileHandle | null) => void;
  markSaved: (bytes: Uint8Array) => void;
  setTool: (t: Tool) => void;
  setColor: (c: string) => void;
  setHighlightColor: (c: string) => void;
  setFontSize: (n: number) => void;
  setPenSize: (n: number) => void;
  setPenStyle: (s: PenStyle) => void;
  setDefaultFontFamily: (f: string) => void;
  setZoom: (z: number) => void;
  setViewMode: (m: ViewMode) => void;
  setSidebarOpen: (b: boolean) => void;
  toggleSidebar: () => void;
  toggleCommentsPanel: () => void;
  setCommentsPanelOpen: (b: boolean) => void;
  setSearchOpen: (b: boolean) => void;
  toggleSearch: () => void;
  setCurrentPage: (i: number) => void;
  setGridOpen: (b: boolean) => void;
  select: (id: string | null) => void;
  setSelectedPages: (ids: number[]) => void;
  toggleSelectedPage: (i: number, mode?: "single" | "toggle" | "range") => void;

  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, patch: Partial<Annotation>, commitToHistory?: boolean) => void;
  removeAnnotation: (id: string) => void;
  pushHistorySnapshot: () => void;

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
  fileHandle: null,
  dirty: false,
  numPages: 0,
  pageOrder: [],
  annotations: [],

  tool: "select",
  color: "#111111",
  highlightColor: "#ffd54a",
  fontSize: 14,
  penSize: 3,
  penStyle: "solid",
  defaultFontFamily: null,
  zoom: 1.15,
  viewMode: "fit-width",
  estimateSize: null,
  sidebarOpen: false,
  commentsPanelOpen: false,
  searchOpen: false,
  currentPage: 0,
  selectedId: null,
  selectedPages: [],
  gridOpen: false,
  fingerprints: [],
  setFingerprints: (fps) => set({ fingerprints: fps }),

  past: [],
  future: [],

  loadDoc: (fileName, bytes, numPages, estimateSize, handle = null) => {
    set({
      fileName,
      originalBytes: bytes,
      fileHandle: handle,
      dirty: false,
      numPages,
      estimateSize,
      pageOrder: Array.from({ length: numPages }, (_, i) => i),
      annotations: [],
      past: [],
      future: [],
      selectedId: null,
      currentPage: 0,
      tool: "select",
      viewMode: "fit-width",
    });
  },

  closeDoc: () => {
    set({
      fileName: null,
      originalBytes: null,
      fileHandle: null,
      dirty: false,
      numPages: 0,
      pageOrder: [],
      annotations: [],
      past: [],
      future: [],
      selectedId: null,
      currentPage: 0,
    });
  },

  setFileHandle: (h) => set({ fileHandle: h }),
  markSaved: (bytes) => set({ originalBytes: bytes, dirty: false }),

  setTool: (t) => set({ tool: t, selectedId: null }),
  setColor: (c) => set({ color: c }),
  setHighlightColor: (c) => set({ highlightColor: c }),
  setFontSize: (n) => set({ fontSize: n }),
  setPenSize: (n) => set({ penSize: n }),
  setPenStyle: (s) => set({ penStyle: s }),
  setDefaultFontFamily: (f) => set({ defaultFontFamily: f }),
  setZoom: (z) => set({ zoom: Math.min(6, Math.max(0.1, z)), viewMode: "custom" }),
  setViewMode: (m) => set({ viewMode: m }),
  setSidebarOpen: (b) => set({ sidebarOpen: b }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleCommentsPanel: () => set((s) => ({ commentsPanelOpen: !s.commentsPanelOpen })),
  setCommentsPanelOpen: (b) => set({ commentsPanelOpen: b }),
  setSearchOpen: (b) => set({ searchOpen: b }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setCurrentPage: (i) => set({ currentPage: i }),
  setGridOpen: (b) => set({ gridOpen: b }),
  select: (id) => set({ selectedId: id }),
  setSelectedPages: (ids) => set({ selectedPages: ids }),
  toggleSelectedPage: (i, mode = "toggle") => {
    const s = get();
    if (mode === "single") {
      set({ selectedPages: [i] });
      return;
    }
    if (mode === "range" && s.selectedPages.length) {
      const last = s.selectedPages[s.selectedPages.length - 1];
      const a = Math.min(last, i);
      const b = Math.max(last, i);
      const range: number[] = [];
      for (let k = a; k <= b; k++) range.push(k);
      set({ selectedPages: range });
      return;
    }
    const has = s.selectedPages.includes(i);
    set({
      selectedPages: has ? s.selectedPages.filter((x) => x !== i) : [...s.selectedPages, i],
    });
  },

  addAnnotation: (a) => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
      dirty: true,
      annotations: [...s.annotations, a],
      selectedId: a.id,
    });
  },

  updateAnnotation: (id, patch, commitToHistory = true) => {
    const s = get();
    set({
      past: commitToHistory ? [...s.past, snap(s)] : s.past,
      future: commitToHistory ? [] : s.future,
      dirty: true,
      annotations: s.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
    });
  },

  pushHistorySnapshot: () => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
    });
  },

  removeAnnotation: (id) => {
    const s = get();
    set({
      past: [...s.past, snap(s)],
      future: [],
      dirty: true,
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    });
  },

  reorderPages: (from, to) => {
    const s = get();
    const order = [...s.pageOrder];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    set({ past: [...s.past, snap(s)], future: [], dirty: true, pageOrder: order });
  },

  deletePage: (displayIndex) => {
    const s = get();
    if (s.pageOrder.length <= 1) return;
    const pageId = s.pageOrder[displayIndex];
    set({
      past: [...s.past, snap(s)],
      future: [],
      dirty: true,
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
      dirty: true,
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
      dirty: true,
      annotations: next.annotations,
      pageOrder: next.pageOrder,
      selectedId: null,
    });
  },
}));

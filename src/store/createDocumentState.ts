import type { Annotation, Tool, ViewMode, PenStyle } from "@/lib/pdf/types";

export interface Snapshot {
  annotations: Annotation[];
  pageOrder: number[];
}

export interface PageSize {
  w: number;
  h: number;
}

export interface DocumentState {
  id: string;
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
  estimateSize: PageSize | null;
  sidebarOpen: boolean;
  commentsPanelOpen: boolean;
  searchOpen: boolean;
  currentPage: number;
  selectedId: string | null;
  gridOpen: boolean;
  pagesPerRow: number;
  setPagesPerRow: (n: number) => void;
  fingerprints: any[];
  setFingerprints: (fps: any[]) => void;
  snapToGuides: boolean;
  toggleSnapToGuides: () => void;

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
  reorderMultiplePages: (indicesToMove: number[], insertAtIndex: number) => void;
  duplicatePages: (indicesToDuplicate: number[], insertAtIndex?: number) => void;
  deletePage: (displayIndex: number) => void;

  undo: () => void;
  redo: () => void;
}

function snap(s: DocumentState): Snapshot {
  return {
    annotations: s.annotations.map((a) => ({ ...a })),
    pageOrder: [...s.pageOrder],
  };
}

export function createDocumentState(
  id: string,
  initialProps?: Partial<DocumentState>,
  dispatch?: (updater: (doc: DocumentState) => void) => void,
): DocumentState {
  const runUpdate = (updater: (doc: DocumentState) => void) => {
    if (dispatch) {
      dispatch(updater);
    } else {
      updater(doc);
    }
  };

  const doc: DocumentState = {
    id,
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
    pagesPerRow: 4,
    fingerprints: [],
    snapToGuides: true,

    past: [],
    future: [],

    ...initialProps,

    setFingerprints: (fps) => runUpdate((d) => { d.fingerprints = fps; }),
    setPagesPerRow: (n) => runUpdate((d) => { d.pagesPerRow = Math.min(8, Math.max(1, Math.round(n))); }),

    loadDoc: (fileName, bytes, numPages, estimateSize, handle = null) =>
      runUpdate((d) => {
        d.fileName = fileName;
        d.originalBytes = bytes;
        d.fileHandle = handle;
        d.dirty = false;
        d.numPages = numPages;
        d.estimateSize = estimateSize;
        d.pageOrder = Array.from({ length: numPages }, (_, i) => i);
        d.annotations = [];
        d.past = [];
        d.future = [];
        d.selectedId = null;
        d.currentPage = 0;
        d.tool = "select";
        d.viewMode = "fit-width";
        d.sidebarOpen = typeof window !== "undefined" && window.innerWidth < 768 ? false : d.sidebarOpen;
      }),

    closeDoc: () =>
      runUpdate((d) => {
        d.fileName = null;
        d.originalBytes = null;
        d.fileHandle = null;
        d.dirty = false;
        d.numPages = 0;
        d.pageOrder = [];
        d.annotations = [];
        d.past = [];
        d.future = [];
        d.selectedId = null;
        d.currentPage = 0;
      }),

    setFileHandle: (h) => runUpdate((d) => { d.fileHandle = h; }),
    markSaved: (bytes) => runUpdate((d) => { d.originalBytes = bytes; d.dirty = false; }),

    setTool: (t) => runUpdate((d) => { d.tool = t; d.selectedId = null; }),
    setColor: (c) => runUpdate((d) => { d.color = c; }),
    setHighlightColor: (c) => runUpdate((d) => { d.highlightColor = c; }),
    setFontSize: (n) => runUpdate((d) => { d.fontSize = n; }),
    setPenSize: (n) => runUpdate((d) => { d.penSize = n; }),
    setPenStyle: (s) => runUpdate((d) => { d.penStyle = s; }),
    setDefaultFontFamily: (f) => runUpdate((d) => { d.defaultFontFamily = f; }),
    setZoom: (z) => runUpdate((d) => { d.zoom = Math.min(6, Math.max(0.1, z)); d.viewMode = "custom"; }),
    setViewMode: (m) => runUpdate((d) => { d.viewMode = m; }),
    setSidebarOpen: (b) => runUpdate((d) => { d.sidebarOpen = b; }),
    toggleSidebar: () => runUpdate((d) => { d.sidebarOpen = !d.sidebarOpen; }),
    toggleCommentsPanel: () => runUpdate((d) => { d.commentsPanelOpen = !d.commentsPanelOpen; }),
    setCommentsPanelOpen: (b) => runUpdate((d) => { d.commentsPanelOpen = b; }),
    setSearchOpen: (b) => runUpdate((d) => { d.searchOpen = b; }),
    toggleSearch: () => runUpdate((d) => { d.searchOpen = !d.searchOpen; }),
    setCurrentPage: (i) => runUpdate((d) => { d.currentPage = i; }),
    setGridOpen: (b) => runUpdate((d) => { d.gridOpen = b; }),
    toggleSnapToGuides: () => runUpdate((d) => { d.snapToGuides = !d.snapToGuides; }),
    select: (id) => runUpdate((d) => { d.selectedId = id; }),
    setSelectedPages: (ids) => runUpdate((d) => { d.selectedPages = ids; }),
    toggleSelectedPage: (i, mode = "toggle") =>
      runUpdate((d) => {
        if (mode === "single") {
          d.selectedPages = [i];
          return;
        }
        if (mode === "range" && d.selectedPages.length) {
          const last = d.selectedPages[d.selectedPages.length - 1];
          const a = Math.min(last, i);
          const b = Math.max(last, i);
          const range: number[] = [];
          for (let k = a; k <= b; k++) range.push(k);
          d.selectedPages = range;
          return;
        }
        const has = d.selectedPages.includes(i);
        d.selectedPages = has ? d.selectedPages.filter((x) => x !== i) : [...d.selectedPages, i];
      }),

    addAnnotation: (a) =>
      runUpdate((d) => {
        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.annotations = [...d.annotations, a];
        d.selectedId = a.id;
      }),

    updateAnnotation: (id, patch, commitToHistory = true) =>
      runUpdate((d) => {
        d.past = commitToHistory ? [...d.past, snap(d)] : d.past;
        d.future = commitToHistory ? [] : d.future;
        d.dirty = true;
        d.annotations = d.annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a));
      }),

    pushHistorySnapshot: () =>
      runUpdate((d) => {
        d.past = [...d.past, snap(d)];
        d.future = [];
      }),

    removeAnnotation: (id) =>
      runUpdate((d) => {
        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.annotations = d.annotations.filter((a) => a.id !== id);
        d.selectedId = d.selectedId === id ? null : d.selectedId;
      }),

    reorderPages: (from, to) =>
      runUpdate((d) => {
        const order = [...d.pageOrder];
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved);
        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.pageOrder = order;
      }),

    reorderMultiplePages: (indicesToMove, insertAtIndex) =>
      runUpdate((d) => {
        if (indicesToMove.length === 0) return;
        const sorted = [...indicesToMove].sort((a, b) => a - b);
        const countBefore = sorted.filter((idx) => idx < insertAtIndex).length;
        const adjustedTarget = insertAtIndex - countBefore;

        const movedItems = sorted
          .map((idx) => d.pageOrder[idx])
          .filter((item) => item !== undefined);
        const remaining = d.pageOrder.filter((_, idx) => !sorted.includes(idx));

        const clampedTarget = Math.max(0, Math.min(adjustedTarget, remaining.length));
        const newOrder = [...remaining];
        newOrder.splice(clampedTarget, 0, ...movedItems);

        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.pageOrder = newOrder;
      }),

    duplicatePages: (indicesToDuplicate, insertAtIndex) =>
      runUpdate((d) => {
        if (indicesToDuplicate.length === 0) return;
        const sorted = [...indicesToDuplicate].sort((a, b) => a - b);
        const validIndices = sorted.filter((idx) => idx >= 0 && idx < d.pageOrder.length);
        if (validIndices.length === 0) return;

        const targetIndex =
          insertAtIndex !== undefined
            ? Math.max(0, Math.min(insertAtIndex, d.pageOrder.length))
            : d.pageOrder.length;

        const duplicatedItems = validIndices.map((idx) => d.pageOrder[idx]);

        const duplicatedAnnotations: Annotation[] = [];
        d.annotations.forEach((anno) => {
          if (duplicatedItems.includes(anno.page)) {
            duplicatedAnnotations.push({
              ...anno,
              id: `anno-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            });
          }
        });

        const newPageOrder = [...d.pageOrder];
        newPageOrder.splice(targetIndex, 0, ...duplicatedItems);

        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.numPages = d.numPages + duplicatedItems.length;
        d.pageOrder = newPageOrder;
        d.annotations = [...d.annotations, ...duplicatedAnnotations];
      }),

    deletePage: (displayIndex) =>
      runUpdate((d) => {
        if (d.pageOrder.length <= 1) return;
        const pageId = d.pageOrder[displayIndex];
        d.past = [...d.past, snap(d)];
        d.future = [];
        d.dirty = true;
        d.pageOrder = d.pageOrder.filter((_, i) => i !== displayIndex);
        d.annotations = d.annotations.filter((a) => a.page !== pageId);
      }),

    undo: () =>
      runUpdate((d) => {
        if (d.past.length === 0) return;
        const previous = d.past[d.past.length - 1];
        d.past = d.past.slice(0, -1);
        d.future = [snap(d), ...d.future];
        d.dirty = true;
        d.annotations = previous.annotations;
        d.pageOrder = previous.pageOrder;
        d.selectedId = null;
      }),

    redo: () =>
      runUpdate((d) => {
        if (d.future.length === 0) return;
        const next = d.future[0];
        d.past = [...d.past, snap(d)];
        d.future = d.future.slice(1);
        d.dirty = true;
        d.annotations = next.annotations;
        d.pageOrder = next.pageOrder;
        d.selectedId = null;
      }),
  };

  return doc;
}

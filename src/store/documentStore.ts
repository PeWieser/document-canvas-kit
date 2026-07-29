import { create } from "zustand";
import { createDocumentState, type DocumentState, type PageSize } from "./createDocumentState";
import type { Annotation } from "@/lib/pdf/types";

export interface DocumentStoreState {
  documents: Map<string, DocumentState>;
  activeDocId: string | null;
  tabOrder: string[];

  openDocument: (params?: {
    fileName?: string;
    bytes?: Uint8Array;
    numPages?: number;
    estimateSize?: PageSize | null;
    handle?: FileSystemFileHandle | null;
  }) => string;

  closeDocument: (id: string) => void;
  switchToDocument: (id: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  renameDocument: (id: string, newFileName: string) => void;

  copyPagesBetweenDocs: (
    sourceDocId: string,
    pageIndices: number[],
    targetDocId: string,
    insertAtIndex?: number,
    isMove?: boolean,
  ) => void;

  reorderMultiplePages: (indicesToMove: number[], insertAtIndex: number) => void;
  duplicatePages: (indicesToDuplicate: number[], insertAtIndex?: number) => void;
  deleteEmptyPages: (pdfDoc?: any) => Promise<number[]>;

  getActive: () => DocumentState | null;
  updateActive: (updater: (doc: DocumentState) => void) => void;
  updateDocument: (id: string, updater: (doc: DocumentState) => void) => void;
}

const INITIAL_DOC_ID = "doc-default";

function createInitialState(
  dispatch: (id: string, updater: (doc: DocumentState) => void) => void,
): { documents: Map<string, DocumentState>; activeDocId: string; tabOrder: string[] } {
  const initialDoc = createDocumentState(INITIAL_DOC_ID, {}, (updater) => dispatch(INITIAL_DOC_ID, updater));
  const documents = new Map<string, DocumentState>();
  documents.set(INITIAL_DOC_ID, initialDoc);
  return {
    documents,
    activeDocId: INITIAL_DOC_ID,
    tabOrder: [INITIAL_DOC_ID],
  };
}

export const useDocumentStore = create<DocumentStoreState>((set, get) => {
  const dispatch = (id: string, updater: (doc: DocumentState) => void) => {
    set((state) => {
      const existing = state.documents.get(id);
      if (!existing) return state;
      updater(existing);
      const updatedDoc = { ...existing };
      const newMap = new Map(state.documents);
      newMap.set(id, updatedDoc);
      return { documents: newMap };
    });
  };

  const initial = createInitialState(dispatch);

  return {
    documents: initial.documents,
    activeDocId: initial.activeDocId,
    tabOrder: initial.tabOrder,

    openDocument: (params) => {
      const id = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      set((state) => {
        const doc = createDocumentState(id, {}, (updater) => dispatch(id, updater));

        if (params?.fileName && params?.bytes && params?.numPages !== undefined) {
          doc.fileName = params.fileName;
          doc.originalBytes = params.bytes;
          doc.numPages = params.numPages;
          doc.estimateSize = params.estimateSize ?? null;
          doc.fileHandle = params.handle ?? null;
          doc.pageOrder = Array.from({ length: params.numPages }, (_, i) => i);
        }

        // If current single tab is an empty default doc (no fileName loaded), replace/overwrite it
        const currentActive = state.activeDocId ? state.documents.get(state.activeDocId) : null;
        if (
          state.tabOrder.length === 1 &&
          currentActive &&
          currentActive.originalBytes === null &&
          currentActive.fileName === null &&
          currentActive.numPages === 0
        ) {
          const newMap = new Map();
          newMap.set(id, doc);
          return {
            documents: newMap,
            tabOrder: [id],
            activeDocId: id,
          };
        }

        const newMap = new Map(state.documents);
        newMap.set(id, doc);
        return {
          documents: newMap,
          tabOrder: [...state.tabOrder, id],
          activeDocId: id,
        };
      });

      return id;
    },

    closeDocument: (id: string) => {
      set((state) => {
        if (!state.documents.has(id)) return state;

        const newMap = new Map(state.documents);
        newMap.delete(id);
        const newTabOrder = state.tabOrder.filter((tId) => tId !== id);

        if (newTabOrder.length === 0) {
          // Re-create a clean default document if all tabs are closed
          const newDefaultId = `doc-${Date.now()}`;
          const newDefaultDoc = createDocumentState(newDefaultId, {}, (updater) => dispatch(newDefaultId, updater));
          newMap.set(newDefaultId, newDefaultDoc);
          return {
            documents: newMap,
            tabOrder: [newDefaultId],
            activeDocId: newDefaultId,
          };
        }

        let nextActiveId = state.activeDocId;
        if (state.activeDocId === id) {
          const closingIndex = state.tabOrder.indexOf(id);
          const nextIndex = Math.max(0, Math.min(closingIndex, newTabOrder.length - 1));
          nextActiveId = newTabOrder[nextIndex];
        }

        return {
          documents: newMap,
          tabOrder: newTabOrder,
          activeDocId: nextActiveId,
        };
      });
    },

    switchToDocument: (id: string) => {
      const state = get();
      if (state.documents.has(id)) {
        set({ activeDocId: id });
      }
    },

    reorderTabs: (fromIndex: number, toIndex: number) => {
      set((state) => {
        if (
          fromIndex < 0 ||
          fromIndex >= state.tabOrder.length ||
          toIndex < 0 ||
          toIndex >= state.tabOrder.length
        ) {
          return state;
        }
        const order = [...state.tabOrder];
        const [moved] = order.splice(fromIndex, 1);
        order.splice(toIndex, 0, moved);
        return { tabOrder: order };
      });
    },

    renameDocument: (id: string, newFileName: string) => {
      dispatch(id, (doc) => {
        doc.fileName = newFileName;
      });
    },

    copyPagesBetweenDocs: (
      sourceDocId: string,
      pageIndices: number[],
      targetDocId: string,
      insertAtIndex?: number,
      isMove = false,
    ) => {
      const state = get();
      const sourceDoc = state.documents.get(sourceDocId);
      const targetDoc = state.documents.get(targetDocId);
      if (!sourceDoc || !targetDoc || pageIndices.length === 0) return;

      const sourcePagesToTransfer = pageIndices.filter(
        (idx) => idx >= 0 && idx < sourceDoc.pageOrder.length,
      );
      if (sourcePagesToTransfer.length === 0) return;

      // Extract original page IDs (or values in sourceDoc.pageOrder)
      const movedPageIds = sourcePagesToTransfer.map((idx) => sourceDoc.pageOrder[idx]);

      // Copy annotations attached to these pages
      const transferredAnnotations: Annotation[] = [];
      sourceDoc.annotations.forEach((anno) => {
        if (movedPageIds.includes(anno.page)) {
          // Generate duplicate annotation ID for target doc
          transferredAnnotations.push({
            ...anno,
            id: `anno-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          });
        }
      });

      // Update Target Doc
      dispatch(targetDocId, (tDoc) => {
        const insertAt =
          insertAtIndex !== undefined
            ? Math.max(0, Math.min(insertAtIndex, tDoc.pageOrder.length))
            : tDoc.pageOrder.length;

        const newPageOrder = [...tDoc.pageOrder];
        newPageOrder.splice(insertAt, 0, ...movedPageIds);

        tDoc.pageOrder = newPageOrder;
        tDoc.numPages = tDoc.numPages + movedPageIds.length;
        tDoc.annotations = [...tDoc.annotations, ...transferredAnnotations];
        tDoc.dirty = true;
      });

      // If Move action, delete pages from Source Doc
      if (isMove) {
        dispatch(sourceDocId, (sDoc) => {
          sDoc.pageOrder = sDoc.pageOrder.filter((_, idx) => !sourcePagesToTransfer.includes(idx));
          sDoc.annotations = sDoc.annotations.filter((anno) => !movedPageIds.includes(anno.page));
          sDoc.dirty = true;
        });
      }
    },

    reorderMultiplePages: (indicesToMove: number[], insertAtIndex: number) => {
      const activeDoc = get().getActive();
      if (activeDoc) {
        activeDoc.reorderMultiplePages(indicesToMove, insertAtIndex);
      }
    },

    duplicatePages: (indicesToDuplicate: number[], insertAtIndex?: number) => {
      const activeDoc = get().getActive();
      if (activeDoc) {
        activeDoc.duplicatePages(indicesToDuplicate, insertAtIndex);
      }
    },

    deleteEmptyPages: async (pdfDoc?: any) => {
      const activeDoc = get().getActive();
      if (activeDoc) {
        return await activeDoc.deleteEmptyPages(pdfDoc);
      }
      return [];
    },

    getActive: () => {
      const state = get();
      if (!state.activeDocId) return null;
      return state.documents.get(state.activeDocId) ?? null;
    },

    updateActive: (updater: (doc: DocumentState) => void) => {
      const activeId = get().activeDocId;
      if (activeId) {
        dispatch(activeId, updater);
      }
    },

    updateDocument: (id: string, updater: (doc: DocumentState) => void) => {
      dispatch(id, updater);
    },
  };
});

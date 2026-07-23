import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../../store/documentStore";

describe("documentStore - Multi-PDF Tab System", () => {
  beforeEach(() => {
    // Reset store to initial state with 1 default doc
    const store = useDocumentStore.getState();
    const docIds = Array.from(store.documents.keys());
    docIds.forEach((id) => store.closeDocument(id));
  });

  it("initializes with at least one active document tab", () => {
    const store = useDocumentStore.getState();
    expect(store.tabOrder.length).toBeGreaterThanOrEqual(1);
    expect(store.activeDocId).toBeDefined();
    expect(store.getActive()).not.toBeNull();
  });

  it("opens new documents and updates activeDocId and tabOrder", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 2 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 4 });

    const state = useDocumentStore.getState();
    expect(state.activeDocId).toBe(doc2Id);
    expect(state.tabOrder).toContain(doc1Id);
    expect(state.tabOrder).toContain(doc2Id);
    expect(state.getActive()?.fileName).toBe("doc2.pdf");
  });

  it("switches active document", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 2 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 4 });

    useDocumentStore.getState().switchToDocument(doc1Id);

    const state = useDocumentStore.getState();
    expect(state.activeDocId).toBe(doc1Id);
    expect(state.getActive()?.fileName).toBe("doc1.pdf");
  });

  it("reorders tabs correctly", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 2 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 4 });

    useDocumentStore.getState().reorderTabs(0, 1);

    const state = useDocumentStore.getState();
    expect(state.tabOrder[state.tabOrder.length - 1]).toBe(doc1Id);
  });

  it("renames a document", () => {
    const store = useDocumentStore.getState();
    const docId = store.openDocument({ fileName: "original.pdf", bytes: new Uint8Array([1]), numPages: 1 });

    useDocumentStore.getState().renameDocument(docId, "renamed.pdf");

    const doc = useDocumentStore.getState().documents.get(docId);
    expect(doc?.fileName).toBe("renamed.pdf");
  });

  it("closes a document and activates an adjacent document", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 2 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 4 });

    useDocumentStore.getState().closeDocument(doc2Id);

    const state = useDocumentStore.getState();
    expect(state.tabOrder).not.toContain(doc2Id);
    expect(state.activeDocId).toBe(doc1Id);
  });

  it("copies pages between documents", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 3 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 2 });

    // Copy page at index 1 from doc1 to doc2
    useDocumentStore.getState().copyPagesBetweenDocs(doc1Id, [1], doc2Id);

    const doc1 = useDocumentStore.getState().documents.get(doc1Id);
    const doc2 = useDocumentStore.getState().documents.get(doc2Id);

    expect(doc1?.pageOrder).toHaveLength(3); // source untouched
    expect(doc2?.pageOrder).toHaveLength(3); // target increased by 1
    expect(doc2?.dirty).toBe(true);
  });

  it("moves pages between documents when isMove is true", () => {
    const store = useDocumentStore.getState();
    const doc1Id = store.openDocument({ fileName: "doc1.pdf", bytes: new Uint8Array([1]), numPages: 3 });
    const doc2Id = store.openDocument({ fileName: "doc2.pdf", bytes: new Uint8Array([2]), numPages: 2 });

    // Move page at index 0 from doc1 to doc2
    useDocumentStore.getState().copyPagesBetweenDocs(doc1Id, [0], doc2Id, undefined, true);

    const doc1 = useDocumentStore.getState().documents.get(doc1Id);
    const doc2 = useDocumentStore.getState().documents.get(doc2Id);

    expect(doc1?.pageOrder).toHaveLength(2); // source decreased by 1
    expect(doc2?.pageOrder).toHaveLength(3); // target increased by 1
  });
});

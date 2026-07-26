import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../../store/documentStore";

describe("documentStore - Page Clipboard & Multi-Page Reorder Unit Tests", () => {
  beforeEach(() => {
    // Reset store to clean state
    const store = useDocumentStore.getState();
    const docIds = Array.from(store.documents.keys());
    docIds.forEach((id) => store.closeDocument(id));
  });

  it("duplicates pages [0, 2] at insertion index 4", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      fileName: "test.pdf",
      bytes: new Uint8Array([1, 2, 3]),
      numPages: 5,
    });

    const activeDoc = useDocumentStore.getState().getActive();
    expect(activeDoc).not.toBeNull();
    expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3, 4]);

    // Duplicate pages at indices [0, 2] and insert at index 4
    useDocumentStore.getState().duplicatePages([0, 2], 4);

    const updatedDoc = useDocumentStore.getState().getActive();
    expect(updatedDoc?.pageOrder).toEqual([0, 1, 2, 3, 0, 2, 4]);
    expect(updatedDoc?.numPages).toBe(7);
    expect(updatedDoc?.dirty).toBe(true);
  });

  it("cuts and pastes (reorders) pages [1, 3] at insertion index 0", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      fileName: "test.pdf",
      bytes: new Uint8Array([1, 2, 3]),
      numPages: 5,
    });

    const activeDoc = useDocumentStore.getState().getActive();
    expect(activeDoc).not.toBeNull();
    expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3, 4]);

    // Cut and paste pages [1, 3] at insertion index 0
    useDocumentStore.getState().reorderMultiplePages([1, 3], 0);

    const updatedDoc = useDocumentStore.getState().getActive();
    expect(updatedDoc?.pageOrder).toEqual([1, 3, 0, 2, 4]);
    expect(updatedDoc?.dirty).toBe(true);
  });
});

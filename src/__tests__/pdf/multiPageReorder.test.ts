import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "../../store/documentStore";

describe("documentStore - Multi-Page Reordering Logic", () => {
  beforeEach(() => {
    // Reset store to initial state
    const store = useDocumentStore.getState();
    const docIds = Array.from(store.documents.keys());
    docIds.forEach((id) => store.closeDocument(id));
  });

  it("handles single page move", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      fileName: "test.pdf",
      bytes: new Uint8Array([1]),
      numPages: 6,
    });

    const activeDoc = useDocumentStore.getState().getActive();
    expect(activeDoc).not.toBeNull();
    expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3, 4, 5]);

    // Move single page at index 1 to target index 4
    activeDoc?.reorderMultiplePages([1], 4);

    const updatedDoc = useDocumentStore.getState().getActive();
    expect(updatedDoc?.pageOrder).toEqual([0, 2, 3, 1, 4, 5]);
  });

  it("handles contiguous multi-page range move (pages [1, 2] moved to index 5)", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      fileName: "test.pdf",
      bytes: new Uint8Array([1]),
      numPages: 7,
    });

    const activeDoc = useDocumentStore.getState().getActive();
    expect(activeDoc).not.toBeNull();
    expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // Move contiguous pages [1, 2] to index 5
    activeDoc?.reorderMultiplePages([1, 2], 5);

    const updatedDoc = useDocumentStore.getState().getActive();
    expect(updatedDoc?.pageOrder).toEqual([0, 3, 4, 1, 2, 5, 6]);
  });

  it("handles non-contiguous multi-page move (pages [0, 3] moved to index 2)", () => {
    const store = useDocumentStore.getState();
    store.openDocument({
      fileName: "test.pdf",
      bytes: new Uint8Array([1]),
      numPages: 6,
    });

    const activeDoc = useDocumentStore.getState().getActive();
    expect(activeDoc).not.toBeNull();
    expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3, 4, 5]);

    // Move non-contiguous pages [0, 3] to index 2
    activeDoc?.reorderMultiplePages([0, 3], 2);

    const updatedDoc = useDocumentStore.getState().getActive();
    expect(updatedDoc?.pageOrder).toEqual([1, 0, 3, 2, 4, 5]);
  });
});

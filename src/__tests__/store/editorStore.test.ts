/**
 * Unit-Tests für editorStore.ts
 *
 * Testet die Kern-Zustandslogik: Undo/Redo, Annotation CRUD, Kommentar-Pin-Logik.
 */
import { describe, it, expect, beforeEach } from "vitest";

// We use the raw store actions without React hooks.
// useEditor.getState() gives us the store without needing React/DOM.
import { useEditor } from "../../store/editorStore";
import type { Annotation } from "../../lib/pdf/types";

// ---- helpers -----------------------------------------------------------

function reset() {
  // Reset the store to a clean document state.
  useEditor.getState().loadDoc("test.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]), 3, {
    w: 595,
    h: 842,
  });
}

function makeTextbox(id: string, page = 0): Annotation {
  return {
    id,
    kind: "textbox",
    page,
    x: 100,
    y: 200,
    w: 180,
    h: 32,
    text: "hello",
    fontSize: 14,
    color: "#111111",
  };
}

function makeComment(id: string, x = 50, y = 100, page = 0): Annotation {
  return {
    id,
    kind: "comment",
    page,
    x,
    y,
    text: "a comment",
    replies: [],
    resolved: false,
  };
}

// ---- tests -------------------------------------------------------------

describe("editorStore – addAnnotation / removeAnnotation", () => {
  beforeEach(reset);

  it("adds an annotation and selects it", () => {
    const { addAnnotation } = useEditor.getState();
    addAnnotation(makeTextbox("a1"));
    const s = useEditor.getState();
    expect(s.annotations).toHaveLength(1);
    expect(s.annotations[0].id).toBe("a1");
    expect(s.selectedId).toBe("a1");
    expect(s.dirty).toBe(true);
  });

  it("removes the selected annotation and clears selection", () => {
    const { addAnnotation, removeAnnotation } = useEditor.getState();
    addAnnotation(makeTextbox("a2"));
    removeAnnotation("a2");
    const s = useEditor.getState();
    expect(s.annotations).toHaveLength(0);
    expect(s.selectedId).toBeNull();
  });

  it("does not affect other annotations when removing one", () => {
    const { addAnnotation, removeAnnotation } = useEditor.getState();
    addAnnotation(makeTextbox("a3"));
    addAnnotation(makeTextbox("a4"));
    removeAnnotation("a3");
    const s = useEditor.getState();
    expect(s.annotations).toHaveLength(1);
    expect(s.annotations[0].id).toBe("a4");
  });
});

describe("editorStore – updateAnnotation", () => {
  beforeEach(reset);

  it("updates a field on an annotation", () => {
    const { addAnnotation, updateAnnotation } = useEditor.getState();
    addAnnotation(makeTextbox("u1"));
    updateAnnotation("u1", { text: "changed" } as Partial<Annotation>);
    const anno = useEditor.getState().annotations.find((a) => a.id === "u1");
    expect(anno).toBeDefined();
    expect((anno as any).text).toBe("changed");
  });

  it("pushes to past history on each update", () => {
    const { addAnnotation, updateAnnotation } = useEditor.getState();
    addAnnotation(makeTextbox("u2"));
    const pastLen = useEditor.getState().past.length;
    updateAnnotation("u2", { text: "first" } as Partial<Annotation>);
    expect(useEditor.getState().past.length).toBe(pastLen + 1);
  });
});

describe("editorStore – Undo / Redo", () => {
  beforeEach(reset);

  it("undo removes the last added annotation", () => {
    const { addAnnotation, undo } = useEditor.getState();
    addAnnotation(makeTextbox("r1"));
    undo();
    expect(useEditor.getState().annotations).toHaveLength(0);
  });

  it("redo re-adds the annotation after undo", () => {
    const { addAnnotation, undo, redo } = useEditor.getState();
    addAnnotation(makeTextbox("r2"));
    undo();
    redo();
    expect(useEditor.getState().annotations).toHaveLength(1);
    expect(useEditor.getState().annotations[0].id).toBe("r2");
  });

  it("adds 3 annotations, undoes 3 times, arrives at 0", () => {
    const { addAnnotation, undo } = useEditor.getState();
    addAnnotation(makeTextbox("x1"));
    addAnnotation(makeTextbox("x2"));
    addAnnotation(makeTextbox("x3"));
    undo();
    undo();
    undo();
    expect(useEditor.getState().annotations).toHaveLength(0);
  });

  it("undo after redo still works correctly", () => {
    const { addAnnotation, undo, redo } = useEditor.getState();
    addAnnotation(makeTextbox("q1"));
    addAnnotation(makeTextbox("q2"));
    undo(); // remove q2
    redo(); // re-add q2
    undo(); // remove q2 again
    expect(useEditor.getState().annotations).toHaveLength(1);
  });

  it("undo does nothing when past is empty", () => {
    useEditor.getState().undo(); // should not throw
    expect(useEditor.getState().annotations).toHaveLength(0);
  });
});

describe("editorStore – page operations", () => {
  beforeEach(reset);

  it("reorderPages moves a page correctly", () => {
    const before = [...useEditor.getState().pageOrder];
    useEditor.getState().reorderPages(0, 2);
    const after = useEditor.getState().pageOrder;
    expect(after[2]).toBe(before[0]);
  });

  it("deletePage removes a page and its annotations", () => {
    const { addAnnotation, deletePage } = useEditor.getState();
    const pageIdToDelete = useEditor.getState().pageOrder[1]; // page at display index 1
    addAnnotation(makeTextbox("del1", pageIdToDelete));
    deletePage(1);
    const s = useEditor.getState();
    expect(s.pageOrder).toHaveLength(2); // 3 pages → 2 after delete
    expect(s.annotations.filter((a) => a.page === pageIdToDelete)).toHaveLength(0);
  });

  it("deletePage does nothing if only 1 page", () => {
    useEditor.getState().loadDoc("test.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]), 1, {
      w: 595,
      h: 842,
    });
    useEditor.getState().deletePage(0);
    expect(useEditor.getState().pageOrder).toHaveLength(1);
  });
});

describe("editorStore – comment pin selection", () => {
  beforeEach(reset);

  it("select() sets selectedId", () => {
    const { addAnnotation, select } = useEditor.getState();
    addAnnotation(makeComment("c1"));
    select("c1");
    expect(useEditor.getState().selectedId).toBe("c1");
  });

  it("select(null) clears selectedId", () => {
    const { addAnnotation, select } = useEditor.getState();
    addAnnotation(makeComment("c2"));
    select("c2");
    select(null);
    expect(useEditor.getState().selectedId).toBeNull();
  });

  it("comment resolve toggle works via updateAnnotation", () => {
    const { addAnnotation, updateAnnotation } = useEditor.getState();
    addAnnotation(makeComment("c3"));
    updateAnnotation("c3", { resolved: true } as Partial<Annotation>);
    const anno = useEditor.getState().annotations.find((a) => a.id === "c3") as any;
    expect(anno.resolved).toBe(true);
  });

  it("comment gets reply via updateAnnotation", () => {
    const { addAnnotation, updateAnnotation } = useEditor.getState();
    addAnnotation(makeComment("c4"));
    updateAnnotation("c4", {
      replies: [{ id: "r1", text: "first reply", ts: Date.now() }],
    } as Partial<Annotation>);
    const anno = useEditor.getState().annotations.find((a) => a.id === "c4") as any;
    expect(anno.replies).toHaveLength(1);
    expect(anno.replies[0].text).toBe("first reply");
  });
});

describe("editorStore – commentsPanel toggle", () => {
  beforeEach(reset);

  it("starts closed", () => {
    expect(useEditor.getState().commentsPanelOpen).toBe(false);
  });

  it("toggles open and closed", () => {
    const { toggleCommentsPanel } = useEditor.getState();
    toggleCommentsPanel();
    expect(useEditor.getState().commentsPanelOpen).toBe(true);
    toggleCommentsPanel();
    expect(useEditor.getState().commentsPanelOpen).toBe(false);
  });
});

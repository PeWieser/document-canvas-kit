import { describe, it, expect, beforeEach } from "vitest";
import { useEditor } from "@/store/editorStore";

describe("CommentsPanel Filtering Logic", () => {
  beforeEach(() => {
    useEditor.getState().loadDoc("test.pdf", new Uint8Array([0x25, 0x50, 0x44, 0x46]), 1, {
      w: 595,
      h: 842,
    });
  });

  it("filters annotations according to CommentsPanel rules", () => {
    // 1. textReplace (should be EXCLUDED)
    useEditor.getState().addAnnotation({
      id: "tr1",
      kind: "textReplace",
      page: 0,
      rect: { x: 10, y: 10, w: 100, h: 20 },
      text: "Recognized Text Replace",
      fontSize: 12,
      color: "#000000",
    } as any);

    // 2. comment (should be INCLUDED)
    useEditor.getState().addAnnotation({
      id: "c1",
      kind: "comment",
      page: 0,
      x: 50,
      y: 50,
      text: "User Comment 1",
      replies: [],
      resolved: false,
    });

    // 3. highlight with text (should be INCLUDED)
    useEditor.getState().addAnnotation({
      id: "h1",
      kind: "highlight",
      page: 0,
      rects: [{ x: 20, y: 20, w: 50, h: 10 }],
      color: "#ffff00",
      text: "Highlight note",
    } as any);

    // 4. ink drawing with reply thread (should be INCLUDED)
    useEditor.getState().addAnnotation({
      id: "ink1",
      kind: "ink",
      page: 0,
      points: [[0, 0], [10, 10]],
      color: "#ff0000",
      size: 2,
      replies: [{ id: "r1", text: "Ink feedback", ts: 12345 }],
    } as any);

    // 5. underline with comment (should be INCLUDED)
    useEditor.getState().addAnnotation({
      id: "u1",
      kind: "underline",
      page: 0,
      rects: [{ x: 5, y: 5, w: 40, h: 5 }],
      color: "#0000ff",
      comment: "Underline comment",
    } as any);

    // 6. strikeout with reply (should be INCLUDED)
    useEditor.getState().addAnnotation({
      id: "s1",
      kind: "strikeout",
      page: 0,
      rects: [{ x: 5, y: 5, w: 40, h: 5 }],
      color: "#ff00ff",
      replies: [{ id: "r2", text: "Strikeout reply", ts: 12346 }],
    } as any);

    const ALLOWED_KINDS = ["comment", "highlight", "ink", "pen", "underline", "strikeout"];
    const annotations = useEditor.getState().annotations;
    const filtered = annotations.filter((a) => {
      if (a.kind === "textReplace") return false;
      if (!ALLOWED_KINDS.includes(a.kind)) return false;
      if (a.kind === "comment") return true;

      const hasCommentText = Boolean((a as any).comment || (a as any).text);
      const hasReplies = Array.isArray((a as any).replies) && (a as any).replies.length > 0;
      return hasCommentText || hasReplies;
    });

    const ids = filtered.map((a) => a.id);
    expect(ids).not.toContain("tr1");
    expect(ids).toContain("c1");
    expect(ids).toContain("h1");
    expect(ids).toContain("ink1");
    expect(ids).toContain("u1");
    expect(ids).toContain("s1");
  });
});

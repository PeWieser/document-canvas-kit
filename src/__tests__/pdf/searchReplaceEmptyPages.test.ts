import { describe, it, expect, beforeEach } from "vitest";
import { useDocumentStore } from "@/store/documentStore";
import { extractFontAndColor } from "@/components/editor/SearchReplacePanel";
import type { Annotation, TextReplaceAnno } from "@/lib/pdf/types";

describe("deleteEmptyPages & Search & Replace Font Inheritance", () => {
  beforeEach(() => {
    const store = useDocumentStore.getState();
    const docIds = Array.from(store.documents.keys());
    docIds.forEach((id) => store.closeDocument(id));
  });

  describe("deleteEmptyPages Action", () => {
    it("scans pageOrder and deletes empty pages (0 text items, 0 annotations, 0 images)", async () => {
      const store = useDocumentStore.getState();
      store.openDocument({
        fileName: "test.pdf",
        bytes: new Uint8Array([1, 2, 3]),
        numPages: 4,
      });

      const activeDoc = store.getActive();
      expect(activeDoc).not.toBeNull();
      expect(activeDoc?.pageOrder).toEqual([0, 1, 2, 3]);

      // Page 2 has an annotation
      activeDoc?.addAnnotation({
        id: "anno-1",
        kind: "highlight",
        page: 2,
        rects: [{ x: 10, y: 10, w: 50, h: 20 }],
        color: "#ff0000",
      } as Annotation);

      // Mock PDF proxy where:
      // Page 0 (pageId 0): Has text items
      // Page 1 (pageId 1): 0 text, 0 annotations, 0 images -> EMPTY
      // Page 2 (pageId 2): 0 text, 1 annotation, 0 images -> NOT empty
      // Page 3 (pageId 3): 0 text, 0 annotations, 1 image -> NOT empty
      const mockPdfDoc = {
        getPage: async (pageNum: number) => {
          if (pageNum === 1) {
            // Page 0
            return {
              getTextContent: async () => ({
                items: [{ str: "Text on page 1", transform: [12, 0, 0, 12, 0, 0], width: 100, height: 12 }],
              }),
              getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
            };
          }
          if (pageNum === 2) {
            // Page 1 - Empty
            return {
              getTextContent: async () => ({ items: [] }),
              getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
            };
          }
          if (pageNum === 3) {
            // Page 2 - Has annotation
            return {
              getTextContent: async () => ({ items: [] }),
              getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
            };
          }
          if (pageNum === 4) {
            // Page 3 - Has image operator (OPS.paintImageXObject = 85)
            return {
              getTextContent: async () => ({ items: [] }),
              getOperatorList: async () => ({ fnArray: [85], argsArray: [[]] }),
            };
          }
          return null;
        },
      };

      const deletedIndices = await activeDoc?.deleteEmptyPages(mockPdfDoc);
      expect(deletedIndices).toEqual([1]);

      const updatedDoc = store.getActive();
      expect(updatedDoc?.pageOrder).toEqual([0, 2, 3]);
    });

    it("preserves at least 1 page if all pages are empty", async () => {
      const store = useDocumentStore.getState();
      store.openDocument({
        fileName: "empty.pdf",
        bytes: new Uint8Array([1, 2]),
        numPages: 2,
      });

      const activeDoc = store.getActive();
      expect(activeDoc?.pageOrder).toEqual([0, 1]);

      const mockPdfDoc = {
        getPage: async () => ({
          getTextContent: async () => ({ items: [] }),
          getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
        }),
      };

      await activeDoc?.deleteEmptyPages(mockPdfDoc);

      const updatedDoc = store.getActive();
      expect(updatedDoc?.pageOrder.length).toBe(1);
    });
  });

  describe("Search & Replace Auto Font & Color Inheritance", () => {
    it("extracts explicit targetItem properties (fontFamily, fontSize, bold, italic, color)", () => {
      const targetItem = {
        str: "Hello World",
        transform: [18, 0, 0, 18, 100, 200],
        width: 80,
        height: 18,
        fontFamily: "Roboto",
        fontSize: 18,
        bold: true,
        italic: true,
        color: "#00ff00",
      };

      const result = extractFontAndColor(targetItem);

      expect(result).toEqual({
        fontFamily: "Roboto",
        fontSize: 18,
        bold: true,
        italic: true,
        color: "#00ff00",
      });
    });

    it("derives fontSize from transform matrix and resolves fontName when explicit fields are missing", () => {
      const targetItem = {
        str: "PDF Text",
        transform: [14, 0, 0, 14, 50, 60],
        width: 40,
        height: 14,
        fontName: "Times-BoldItalic",
      };

      const result = extractFontAndColor(targetItem);

      expect(result.fontSize).toBe(14);
      expect(result.fontFamily).toBe("Times New Roman");
      expect(result.bold).toBe(true);
      expect(result.italic).toBe(true);
      expect(result.color).toBe("#111111");
    });

    it("falls back to Helvetica, 12pt, non-bold, non-italic, default color when targetItem is minimal", () => {
      const targetItem = {
        str: "Plain",
        transform: [12, 0, 0, 12, 0, 0],
        width: 30,
        height: 12,
      };

      const result = extractFontAndColor(targetItem);

      expect(result).toEqual({
        fontFamily: "Helvetica",
        fontSize: 12,
        bold: false,
        italic: false,
        color: "#111111",
      });
    });

    it("creates replacement annotation with exact inherited font and color properties", () => {
      const store = useDocumentStore.getState();
      store.openDocument({
        fileName: "test.pdf",
        bytes: new Uint8Array([1]),
        numPages: 1,
      });

      const activeDoc = store.getActive();

      const targetItem = {
        str: "Old text",
        transform: [16, 0, 0, 16, 10, 20],
        width: 60,
        height: 16,
        fontName: "Courier-Bold",
        color: "#123456",
      };

      const inherited = extractFontAndColor(targetItem);

      const replacementAnno: TextReplaceAnno = {
        id: "anno-replace-1",
        kind: "textReplace",
        page: 0,
        rect: { x: 10, y: 20, w: 60, h: 16 },
        text: "New text",
        fontSize: inherited.fontSize,
        color: inherited.color,
        fontFamily: inherited.fontFamily,
        bold: inherited.bold,
        italic: inherited.italic,
        transform: targetItem.transform,
        width: 60,
        lineHeight: inherited.fontSize,
      };

      activeDoc?.addAnnotation(replacementAnno);

      const savedAnnos = store.getActive()?.annotations;
      expect(savedAnnos?.length).toBe(1);
      const saved = savedAnnos?.[0] as TextReplaceAnno;

      expect(saved.fontFamily).toBe("Courier New");
      expect(saved.fontSize).toBe(16);
      expect(saved.bold).toBe(true);
      expect(saved.italic).toBe(false);
      expect(saved.color).toBe("#123456");
      expect(saved.text).toBe("New text");
    });
  });
});

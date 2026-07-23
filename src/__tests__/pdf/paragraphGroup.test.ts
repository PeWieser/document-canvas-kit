import { describe, it, expect } from "vitest";
import { detectParagraphs } from "../../lib/pdf/paragraphGroup";

describe("Paragraph and Line Detection Engine", () => {
  it("groups single line text items correctly", () => {
    const items = [
      { str: "Hello ", transform: [12, 0, 0, 12, 100, 700], width: 40, fontName: "F1" },
      { str: "World", transform: [12, 0, 0, 12, 145, 700], width: 35, fontName: "F1" },
    ];

    const paragraphs = detectParagraphs(items);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].fullText).toBe("Hello World");
    expect(paragraphs[0].lines.length).toBe(1);
  });

  it("groups multi-line paragraph items into a single paragraph block with linebreaks", () => {
    const items = [
      { str: "First line of paragraph", transform: [12, 0, 0, 12, 100, 700], width: 120, fontName: "F1" },
      { str: "Second line of paragraph", transform: [12, 0, 0, 12, 100, 685], width: 130, fontName: "F1" },
      { str: "Third line of paragraph", transform: [12, 0, 0, 12, 100, 670], width: 125, fontName: "F1" },
    ];

    const paragraphs = detectParagraphs(items);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].lines.length).toBe(3);
    expect(paragraphs[0].fullText).toBe(
      "First line of paragraph\nSecond line of paragraph\nThird line of paragraph"
    );
  });

  it("separates distant text blocks into distinct paragraphs", () => {
    const items = [
      { str: "Header Title", transform: [20, 0, 0, 20, 100, 750], width: 150, fontName: "F1" },
      { str: "Paragraph body text line 1", transform: [12, 0, 0, 12, 100, 650], width: 160, fontName: "F2" },
      { str: "Paragraph body text line 2", transform: [12, 0, 0, 12, 100, 635], width: 160, fontName: "F2" },
    ];

    const paragraphs = detectParagraphs(items);
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].fullText).toBe("Header Title");
    expect(paragraphs[1].fullText).toBe("Paragraph body text line 1\nParagraph body text line 2");
  });

  it("merges word fragments in large headlines correctly without inserting unwanted spaces", () => {
    const items = [
      { str: "F", transform: [36, 0, 0, 36, 100, 700], width: 22, fontName: "F1" },
      { str: "ARBMANAGEMEN", transform: [36, 0, 0, 36, 127, 700], width: 250, fontName: "F1" },
      { str: "T", transform: [36, 0, 0, 36, 381, 700], width: 20, fontName: "F1" },
    ];

    const paragraphs = detectParagraphs(items);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].fullText).toBe("FARBMANAGEMENT");
  });

  it("caps paragraph lineHeight to max 1.3 * fontSize", () => {
    const items = [
      { str: "Line 1 of text", transform: [12, 0, 0, 12, 100, 700], width: 100, fontName: "F1" },
      { str: "Line 2 of text", transform: [12, 0, 0, 12, 100, 683], width: 100, fontName: "F1" },
    ];

    const paragraphs = detectParagraphs(items);
    expect(paragraphs.length).toBe(1);
    expect(paragraphs[0].lineHeight).toBeCloseTo(15.6, 2);
    expect(paragraphs[0].style?.lineHeight).toBeCloseTo(1.3, 2);
  });
});

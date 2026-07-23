import { describe, it, expect } from "vitest";
import { parseHtmlToTextRuns, runsToHtml, mergeTextRuns } from "../../components/editor/RichTextEditor";
import type { TextRun } from "../../lib/pdf/paragraphGroup";

describe("RichTextEditor HTML <-> TextRun Conversion", () => {
  it("parses HTML tags (b, i, u, s, sup, sub) into structured TextRun[]", () => {
    const html = "<b>Bold text</b> <i>Italic text</i> <u>Underlined</u> <s>Strikethrough</s>";
    const runs = parseHtmlToTextRuns(html);

    expect(runs.length).toBeGreaterThan(0);
    const boldRun = runs.find((r) => r.text.includes("Bold text"));
    expect(boldRun?.bold).toBe(true);

    const italicRun = runs.find((r) => r.text.includes("Italic text"));
    expect(italicRun?.italic).toBe(true);

    const underlineRun = runs.find((r) => r.text.includes("Underlined"));
    expect(underlineRun?.underline).toBe(true);

    const strikeRun = runs.find((r) => r.text.includes("Strikethrough"));
    expect(strikeRun?.strikethrough).toBe(true);
  });

  it("converts TextRun[] back to clean HTML", () => {
    const runs: TextRun[] = [
      { text: "Bold and italic", bold: true, italic: true },
      { text: " Normal text" },
    ];
    const html = runsToHtml(runs);
    expect(html).toContain("Bold and italic");
    expect(html).toContain("Normal text");
  });

  it("merges adjacent runs with identical styling attributes", () => {
    const rawRuns: TextRun[] = [
      { text: "Hello ", bold: true },
      { text: "World", bold: true },
    ];
    const merged = mergeTextRuns(rawRuns);
    expect(merged.length).toBe(1);
    expect(merged[0].text).toBe("Hello World");
    expect(merged[0].bold).toBe(true);
  });
});

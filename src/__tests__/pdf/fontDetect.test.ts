/**
 * Extended matrix tests for resolvePDFCoreFontName.
 * Ensures every common PostScript naming convention resolves correctly.
 */
import { describe, it, expect } from "vitest";
import { resolvePDFCoreFontName, cssFontStack, COMMON_FONTS } from "../../lib/pdf/fontDetect";

interface Row {
  input: string;
  family: string;
  bold: boolean;
  italic: boolean;
}

const cases: Row[] = [
  // Subset prefixes
  { input: "ABCDEF+Arial-BoldMT", family: "Arial", bold: true, italic: false },
  { input: "XYZABC+TimesNewRomanPS-BoldItalicMT", family: "Times New Roman", bold: true, italic: true },
  { input: "AAAAAA+Calibri", family: "Calibri", bold: false, italic: false },

  // Direct psNameMap
  { input: "ArialMT", family: "Arial", bold: false, italic: false },
  { input: "Arial-ItalicMT", family: "Arial", bold: false, italic: true },
  { input: "TimesNewRomanPSMT", family: "Times New Roman", bold: false, italic: false },
  { input: "Calibri-Bold", family: "Calibri", bold: true, italic: false },
  { input: "Verdana-BoldItalic", family: "Verdana", bold: true, italic: true },
  { input: "CourierNewPSMT", family: "Courier New", bold: false, italic: false },

  // Weight suffixes
  { input: "Roboto-SemiBold", family: "Roboto", bold: true, italic: false },
  { input: "Roboto-DemiBold", family: "Roboto", bold: true, italic: false },
  { input: "Roboto-ExtraBold", family: "Roboto", bold: true, italic: false },
  { input: "Roboto-Black", family: "Roboto", bold: true, italic: false },
  { input: "Roboto-Heavy", family: "Roboto", bold: true, italic: false },
  { input: "Roboto-Light", family: "Roboto", bold: false, italic: false },
  { input: "Roboto-Thin", family: "Roboto", bold: false, italic: false },
  { input: "Roboto-Medium", family: "Roboto", bold: false, italic: false },

  // Italic variants
  { input: "OpenSans-Oblique", family: "Open Sans", bold: false, italic: true },
  { input: "OpenSans-SemiBoldItalic", family: "Open Sans", bold: true, italic: true },

  // Comma style ("Family,Bold")
  { input: "Helvetica,Bold", family: "Helvetica", bold: true, italic: false },
  { input: "MyFont,BoldItalic", family: "My Font", bold: true, italic: true },

  // CamelCase fallback + style stripping
  { input: "MyCustomFont", family: "My Custom Font", bold: false, italic: false },
  { input: "MyCustomFont-BoldOblique", family: "My Custom Font", bold: true, italic: true },

  // CID/generic fallbacks
  { input: "", family: "Helvetica", bold: false, italic: false },
  { input: "f1", family: "Helvetica", bold: false, italic: false },
  { input: "g2", family: "Helvetica", bold: false, italic: false },
  { input: "TTF4t00", family: "Helvetica", bold: false, italic: false },
  { input: "g_d0_f1", family: "Helvetica", bold: false, italic: false },
];

describe("resolvePDFCoreFontName – matrix", () => {
  it.each(cases)("$input → $family (bold=$bold italic=$italic)", (row) => {
    const r = resolvePDFCoreFontName(row.input);
    expect(r.family).toBe(row.family);
    expect(r.isBold).toBe(row.bold);
    expect(r.isItalic).toBe(row.italic);
  });
});

describe("cssFontStack", () => {
  it("wraps known family in quotes with fallbacks", () => {
    expect(cssFontStack("Arial")).toBe('"Arial", Helvetica, Arial, sans-serif');
  });
  it("returns plain fallback for empty input", () => {
    expect(cssFontStack("")).toBe("Helvetica, Arial, sans-serif");
  });
  it("returns plain fallback for generic 'sans-serif'", () => {
    expect(cssFontStack("sans-serif")).toBe("Helvetica, Arial, sans-serif");
  });
});

describe("COMMON_FONTS", () => {
  it("contains at least 5 entries", () => {
    expect(COMMON_FONTS.length).toBeGreaterThanOrEqual(5);
  });
  it("contains Arial and Helvetica", () => {
    expect(COMMON_FONTS).toContain("Arial");
    expect(COMMON_FONTS).toContain("Helvetica");
  });
});

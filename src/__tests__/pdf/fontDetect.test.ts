/**
 * Unit-Tests für fontDetect.ts
 *
 * Testet resolvePDFCoreFontName mit realen PostScript-Namen aus PDFs.
 */
import { describe, it, expect } from "vitest";
import { resolvePDFCoreFontName, cssFontStack, COMMON_FONTS } from "../../lib/pdf/fontDetect";

describe("resolvePDFCoreFontName", () => {
  // --- Subset-prefix stripping ---
  it("strips 6-char subset prefix (ABCDEF+)", () => {
    const r = resolvePDFCoreFontName("ABCDEF+Arial-BoldMT");
    expect(r.family).toBe("Arial");
    expect(r.isBold).toBe(true);
    expect(r.isItalic).toBe(false);
  });

  it("strips subset prefix from Times New Roman bold italic", () => {
    const r = resolvePDFCoreFontName("XYZABC+TimesNewRomanPS-BoldItalicMT");
    expect(r.family).toBe("Times New Roman");
    expect(r.isBold).toBe(true);
    expect(r.isItalic).toBe(true);
  });

  // --- Direct psNameMap matches ---
  it("resolves ArialMT → Arial", () => {
    const r = resolvePDFCoreFontName("ArialMT");
    expect(r.family).toBe("Arial");
    expect(r.isBold).toBe(false);
    expect(r.isItalic).toBe(false);
  });

  it("resolves Arial-ItalicMT → Arial italic", () => {
    const r = resolvePDFCoreFontName("Arial-ItalicMT");
    expect(r.family).toBe("Arial");
    expect(r.isItalic).toBe(true);
  });

  it("resolves TimesNewRomanPSMT → Times New Roman", () => {
    const r = resolvePDFCoreFontName("TimesNewRomanPSMT");
    expect(r.family).toBe("Times New Roman");
  });

  it("resolves Calibri-Bold → Calibri bold", () => {
    const r = resolvePDFCoreFontName("Calibri-Bold");
    expect(r.family).toBe("Calibri");
    expect(r.isBold).toBe(true);
  });

  it("resolves Verdana-BoldItalic → Verdana bold+italic", () => {
    const r = resolvePDFCoreFontName("Verdana-BoldItalic");
    expect(r.family).toBe("Verdana");
    expect(r.isBold).toBe(true);
    expect(r.isItalic).toBe(true);
  });

  it("resolves CourierNewPSMT → Courier New", () => {
    const r = resolvePDFCoreFontName("CourierNewPSMT");
    expect(r.family).toBe("Courier New");
  });

  // --- CamelCase splitting (fallback) ---
  it("splits unknown camelCase name gracefully", () => {
    const r = resolvePDFCoreFontName("MyCustomFont");
    expect(r.family).toBe("My Custom Font");
  });

  // --- Fallback to Helvetica ---
  it("falls back to Helvetica for empty input", () => {
    const r = resolvePDFCoreFontName("");
    expect(r.family).toBe("Helvetica");
    expect(r.isBold).toBe(false);
    expect(r.isItalic).toBe(false);
  });

  it("falls back to Helvetica for purely numeric CID name", () => {
    const r = resolvePDFCoreFontName("f1");
    expect(r.family).toBe("Helvetica");
  });

  it("falls back to Helvetica for short letter+number CID", () => {
    const r = resolvePDFCoreFontName("g2");
    expect(r.family).toBe("Helvetica");
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

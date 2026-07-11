// Font detection & loading for text replacement.
// Consolidated & fixed from the uploaded FontLoader betas.

import { getCachedFont, setCachedFont } from "./fontCache";

const STANDARD = new Set(["sans-serif", "serif", "monospace"]);

// Subset prefixes look like "ABCDEF+" – six uppercase letters and a plus.
const SUBSET_PREFIX = /^[A-Z]{6}\+/;

/** Load a web font family into the document so the live preview matches. */
export async function loadWebFont(fontFamily: string): Promise<boolean> {
  if (!fontFamily || !fontFamily.trim()) return false;

  let cleanName = fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  cleanName = cleanName.replace(/-(Bold|Italic|Oblique|Regular|Medium|Light)$/i, "");

  if (STANDARD.has(cleanName.toLowerCase())) return true;

  const id = `font-${cleanName.replace(/\s+/g, "-")}`;
  if (typeof document === "undefined") return false;
  if (document.getElementById(id)) return true;

  return new Promise((resolve) => {
    const fam = cleanName.replace(/\s+/g, "+");
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    // Bunny Fonts – privacy friendly, no Google.
    link.href = `https://fonts.bunny.net/css?family=${fam}:400,400i,700,700i`;
    link.onload = () => resolve(true);
    link.onerror = () => {
      link.remove();
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

export interface ResolvedFont {
  family: string;
  isBold: boolean;
  isItalic: boolean;
}

// Common PostScript / embedded font names → friendly CSS families.
const psNameMap: Record<string, string> = {
  // Times
  TimesNewRomanPSMT: "Times New Roman",
  "TimesNewRomanPS-BoldMT": "Times New Roman",
  "TimesNewRomanPS-ItalicMT": "Times New Roman",
  "TimesNewRomanPS-BoldItalicMT": "Times New Roman",
  TimesNewRoman: "Times New Roman",
  // Arial
  ArialMT: "Arial",
  "Arial-BoldMT": "Arial",
  "Arial-ItalicMT": "Arial",
  "Arial-BoldItalicMT": "Arial",
  // Calibri
  Calibri: "Calibri",
  "Calibri-Bold": "Calibri",
  "Calibri-Italic": "Calibri",
  "Calibri-BoldItalic": "Calibri",
  // Cambria
  Cambria: "Cambria",
  "Cambria-Bold": "Cambria",
  "Cambria-Italic": "Cambria",
  "Cambria-BoldItalic": "Cambria",
  CambriaMath: "Cambria",
  // Verdana
  Verdana: "Verdana",
  "Verdana-Bold": "Verdana",
  "Verdana-Italic": "Verdana",
  "Verdana-BoldItalic": "Verdana",
  // Georgia
  Georgia: "Georgia",
  "Georgia-Bold": "Georgia",
  "Georgia-Italic": "Georgia",
  "Georgia-BoldItalic": "Georgia",
  // Trebuchet MS
  "TrebuchetMS": "Trebuchet MS",
  "TrebuchetMS-Bold": "Trebuchet MS",
  "TrebuchetMS-Italic": "Trebuchet MS",
  "TrebuchetMS-BoldItalic": "Trebuchet MS",
  // Tahoma
  Tahoma: "Tahoma",
  "Tahoma-Bold": "Tahoma",
  // Consolas
  Consolas: "Consolas",
  "Consolas-Bold": "Consolas",
  "Consolas-Italic": "Consolas",
  // Courier
  CourierNewPSMT: "Courier New",
  "CourierNewPS-BoldMT": "Courier New",
  "CourierNewPS-ItalicMT": "Courier New",
  "CourierNewPS-BoldItalicMT": "Courier New",
};

/** Resolve a raw PDF font name (possibly subset-prefixed) to a friendly family + style. */
export function resolvePDFCoreFontName(fontName: string): ResolvedFont {
  if (!fontName) return { family: "Helvetica", isBold: false, isItalic: false };

  let cleanName = fontName.replace(SUBSET_PREFIX, "");

  // Derive style from the *raw* name before we strip style tokens away.
  const lowerRaw = cleanName.toLowerCase();
  const isBold =
    lowerRaw.includes("bold") ||
    lowerRaw.includes("-bd") ||
    lowerRaw.includes(" bd") ||
    lowerRaw.endsWith("bd") ||
    lowerRaw.includes("heavy") ||
    lowerRaw.includes("black") ||
    lowerRaw.includes("semibold");
  const isItalic =
    lowerRaw.includes("italic") ||
    lowerRaw.includes("oblique") ||
    lowerRaw.includes("-it") ||
    lowerRaw.includes(" it");

  if (psNameMap[cleanName]) {
    return { family: psNameMap[cleanName], isBold, isItalic };
  }

  // Fall back to splitting camelCase and stripping style tokens.
  cleanName = cleanName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_ ]?(SemiBold|Bold|Italic|Oblique|Regular|Medium|Light|Heavy|Black|MT|PS|Bd|It)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // CID / purely numeric / empty names → safe default with a warning.
  if (!cleanName || /^\d+$/.test(cleanName) || /^[A-Za-z]{1,2}\d+$/.test(cleanName)) {
    if (fontName) console.warn("Unresolved font name, falling back to Helvetica:", fontName);
    return { family: "Helvetica", isBold, isItalic };
  }

  return { family: cleanName, isBold, isItalic };
}

/** Fetch real .ttf bytes for pdf-lib embedding (Bunny Fonts, spoofing an old UA). */
export async function getFontBytes(
  fontFamily: string,
  isBold = false,
  isItalic = false,
): Promise<Uint8Array | null> {
  if (!fontFamily || !fontFamily.trim()) return null;

  let cleanName = fontFamily.split(",")[0].replace(/['"]/g, "").trim();
  cleanName = cleanName.replace(/-(Bold|Italic|Oblique|Regular|Medium|Light)$/i, "");
  if (STANDARD.has(cleanName.toLowerCase())) return null;

  let styleSuffix = "";
  if (isBold && isItalic) styleSuffix = ":700i";
  else if (isBold) styleSuffix = ":700";
  else if (isItalic) styleSuffix = ":400i";

  const cacheKey = `font:${cleanName}${styleSuffix}`;

  // 1) Cache first (offline-first).
  const cached = await getCachedFont(cacheKey);
  if (cached) return new Uint8Array(cached);

  // 2) Network.
  try {
    const cssUrl = `https://fonts.bunny.net/css?family=${cleanName.replace(/\s+/g, "+")}${styleSuffix}`;
    const cssRes = await fetch(cssUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1",
      },
    });
    if (!cssRes.ok) return null;

    const cssText = await cssRes.text();
    const urlMatch = cssText.match(/url\((https:\/\/[^)]+)\)/);
    if (urlMatch && urlMatch[1]) {
      let fontUrl = urlMatch[1];
      if (fontUrl.startsWith("'") || fontUrl.startsWith('"')) fontUrl = fontUrl.slice(1, -1);
      const fontRes = await fetch(fontUrl);
      if (fontRes.ok) {
        const buf = await fontRes.arrayBuffer();
        await setCachedFont(cacheKey, buf.slice(0));
        return new Uint8Array(buf);
      }
    }
  } catch (err) {
    console.warn("Could not fetch font bytes for", cleanName, err);
  }
  return null;
}

/** A CSS font-family stack usable for on-screen rendering. */
export function cssFontStack(family: string): string {
  if (!family || STANDARD.has(family.toLowerCase())) return "Helvetica, Arial, sans-serif";
  return `"${family}", Helvetica, Arial, sans-serif`;
}

// Families offered in the manual font picker.
export const COMMON_FONTS = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Calibri",
  "Cambria",
  "Georgia",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Courier New",
  "Consolas",
];

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

const psNameMap: Record<string, string> = {
  // Times
  TimesNewRomanPSMT: "Times New Roman",
  "TimesNewRomanPS-BoldMT": "Times New Roman",
  "TimesNewRomanPS-ItalicMT": "Times New Roman",
  "TimesNewRomanPS-BoldItalicMT": "Times New Roman",
  TimesNewRoman: "Times New Roman",
  "TimesNewRoman-Bold": "Times New Roman",
  "TimesNewRoman-Italic": "Times New Roman",
  "TimesNewRoman-BoldItalic": "Times New Roman",
  "Times-Roman": "Times New Roman",
  "Times-Bold": "Times New Roman",
  "Times-Italic": "Times New Roman",
  "Times-BoldItalic": "Times New Roman",

  // Arial
  ArialMT: "Arial",
  "Arial-BoldMT": "Arial",
  "Arial-ItalicMT": "Arial",
  "Arial-BoldItalicMT": "Arial",
  Arial: "Arial",
  "Arial-Bold": "Arial",
  "Arial-Italic": "Arial",
  "Arial-BoldItalic": "Arial",
  "Arial-Black": "Arial Black",

  // Calibri
  Calibri: "Calibri",
  "Calibri-Bold": "Calibri",
  "Calibri-Italic": "Calibri",
  "Calibri-BoldItalic": "Calibri",
  "Calibri-Light": "Calibri",

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
  TrebuchetMS: "Trebuchet MS",
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
  "Consolas-BoldItalic": "Consolas",

  // Courier
  CourierNewPSMT: "Courier New",
  "CourierNewPS-BoldMT": "Courier New",
  "CourierNewPS-ItalicMT": "Courier New",
  "CourierNewPS-BoldItalicMT": "Courier New",
  "Courier-Oblique": "Courier New",
  "Courier-BoldOblique": "Courier New",
  "Courier-Bold": "Courier New",
  Courier: "Courier New",

  // Segoe UI
  SegoeUI: "Segoe UI",
  "SegoeUI-Bold": "Segoe UI",
  "SegoeUI-Italic": "Segoe UI",
  "SegoeUI-BoldItalic": "Segoe UI",
  "SegoeUI-Semibold": "Segoe UI",
  "SegoeUI-Light": "Segoe UI",

  // Comic Sans MS
  ComicSansMS: "Comic Sans MS",
  "ComicSansMS-Bold": "Comic Sans MS",

  // Impact
  Impact: "Impact",

  // Garamond
  Garamond: "Garamond",
  "Garamond-Bold": "Garamond",
  "Garamond-Italic": "Garamond",

  // Book Antiqua
  BookAntiqua: "Book Antiqua",
  "BookAntiqua-Bold": "Book Antiqua",
  "BookAntiqua-Italic": "Book Antiqua",

  // Palatino Linotype
  "PalatinoLinotype-Roman": "Palatino Linotype",
  "PalatinoLinotype-Bold": "Palatino Linotype",
  "PalatinoLinotype-Italic": "Palatino Linotype",

  // Google Fonts
  // Roboto
  "Roboto-Regular": "Roboto",
  "Roboto-Bold": "Roboto",
  "Roboto-Italic": "Roboto",
  "Roboto-BoldItalic": "Roboto",
  "Roboto-Medium": "Roboto",
  "Roboto-Light": "Roboto",

  // Open Sans
  "OpenSans-Regular": "Open Sans",
  "OpenSans-Bold": "Open Sans",
  "OpenSans-Italic": "Open Sans",
  "OpenSans-BoldItalic": "Open Sans",
  "OpenSans-SemiBold": "Open Sans",
  OpenSans: "Open Sans",

  // Lato
  "Lato-Regular": "Lato",
  "Lato-Bold": "Lato",
  "Lato-Italic": "Lato",
  "Lato-BoldItalic": "Lato",

  // Montserrat
  "Montserrat-Regular": "Montserrat",
  "Montserrat-Bold": "Montserrat",
  "Montserrat-Italic": "Montserrat",
  "Montserrat-BoldItalic": "Montserrat",
  "Montserrat-SemiBold": "Montserrat",

  // Oswald
  "Oswald-Regular": "Oswald",
  "Oswald-Bold": "Oswald",

  // Source Sans Pro
  "SourceSansPro-Regular": "Source Sans Pro",
  "SourceSansPro-Bold": "Source Sans Pro",
  "SourceSansPro-Italic": "Source Sans Pro",

  // Ubuntu
  "Ubuntu-Regular": "Ubuntu",
  "Ubuntu-Bold": "Ubuntu",
  "Ubuntu-Italic": "Ubuntu",

  // Nunito
  "Nunito-Regular": "Nunito",
  "Nunito-Bold": "Nunito",
  "Nunito-Italic": "Nunito",

  // Raleway
  "Raleway-Regular": "Raleway",
  "Raleway-Bold": "Raleway",
  "Raleway-Italic": "Raleway",

  // Playfair Display
  "PlayfairDisplay-Regular": "Playfair Display",
  "PlayfairDisplay-Bold": "Playfair Display",
  "PlayfairDisplay-Italic": "Playfair Display",

  // Merriweather
  "Merriweather-Regular": "Merriweather",
  "Merriweather-Bold": "Merriweather",
  "Merriweather-Italic": "Merriweather",

  // PT Sans
  "PTSans-Regular": "PT Sans",
  "PTSans-Bold": "PT Sans",
  "PTSans-Italic": "PT Sans",

  // PT Serif
  "PTSerif-Regular": "PT Serif",
  "PTSerif-Bold": "PT Serif",
  "PTSerif-Italic": "PT Serif",

  // Inter
  "Inter-Regular": "Inter",
  "Inter-Bold": "Inter",
  "Inter-Italic": "Inter",
  "Inter-SemiBold": "Inter",
  "Inter-Medium": "Inter",

  // Lora
  "Lora-Regular": "Lora",
  "Lora-Bold": "Lora",
  "Lora-Italic": "Lora",

  // Roboto Slab
  "RobotoSlab-Regular": "Roboto Slab",
  "RobotoSlab-Bold": "Roboto Slab",

  // Poppins
  "Poppins-Regular": "Poppins",
  "Poppins-Bold": "Poppins",
  "Poppins-Italic": "Poppins",
  "Poppins-SemiBold": "Poppins",

  // Noto Sans
  NotoSans: "Noto Sans",
  "NotoSans-Bold": "Noto Sans",
  "NotoSans-Italic": "Noto Sans",

  // Noto Serif
  NotoSerif: "Noto Serif",
  "NotoSerif-Bold": "Noto Serif",
  "NotoSerif-Italic": "Noto Serif",
};

/** Resolve a raw PDF font name (possibly subset-prefixed) to a friendly family + style. */
export function resolvePDFCoreFontName(fontName: string): ResolvedFont {
  if (!fontName) return { family: "Helvetica", isBold: false, isItalic: false };

  let cleanName = fontName.replace(SUBSET_PREFIX, "");
  // Detect style from the full name (before comma / suffix stripping).
  const styleSrc = cleanName.toLowerCase();
  const isBold =
    /(bold|semibold|demibold|extrabold|ultrabold|heavy|black)/i.test(styleSrc) ||
    /-bd\b|\bbd\b/i.test(styleSrc);
  const isItalic =
    /(italic|oblique)/i.test(styleSrc) ||
    /-it\b|\bit\b/i.test(styleSrc);

  // "Family,Bold" style: strip trailing ",Bold" / ",Italic" for lookup.
  cleanName = cleanName.replace(/,.*$/, "");
  // Strip trailing numeric suffixes like -7888 or -979
  cleanName = cleanName.replace(/-\d+$/g, "");

  if (psNameMap[cleanName]) {
    return { family: psNameMap[cleanName], isBold, isItalic };
  }

  // Strip style tokens. Loop until stable so multi-token names collapse
  // (e.g. "SemiBoldItalic" → "SemiBold" → "Semi" → "").
  let prev = "";
  cleanName = cleanName.replace(/([a-z])([A-Z])/g, "$1 $2");
  while (prev !== cleanName) {
    prev = cleanName;
    cleanName = cleanName
      .replace(
        /[-_ ]?(SemiBold|DemiBold|ExtraBold|UltraBold|Semi|Demi|Extra|Ultra|Bold|Italic|Oblique|Regular|Medium|Light|Heavy|Black|Book|Thin|Roman|Condensed|Cond|Narrow|MT|PS|Bd|It)\b/gi,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  // CID / purely numeric / empty names / alphanumeric subset names (e.g. TTF4t00, g_d0_f1) → safe default.
  if (
    !cleanName ||
    /^\d+$/.test(cleanName) ||
    /^[A-Za-z]{1,3}\d+[A-Za-z0-9]*$/.test(cleanName) ||
    /^[a-z]_[a-z]\d+_[a-z]\d+$/.test(cleanName)
  ) {
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

  // Offline-first: if in Node/test runner environment, load from C:/Windows/Fonts if available
  if (typeof window === "undefined" || (typeof process !== "undefined" && process.versions?.node)) {
    try {
      const fs = await import("fs");
      const path = await import("path");
      let localPath = "";
      const lower = cleanName.toLowerCase();
      if (lower.includes("arial")) {
        localPath = isBold ? "C:/Windows/Fonts/arialbd.ttf" : "C:/Windows/Fonts/arial.ttf";
      } else if (lower.includes("times")) {
        localPath = isBold ? "C:/Windows/Fonts/timesbd.ttf" : "C:/Windows/Fonts/times.ttf";
      } else if (lower.includes("courier")) {
        localPath = isBold ? "C:/Windows/Fonts/courbd.ttf" : "C:/Windows/Fonts/cour.ttf";
      }
      if (localPath && fs.default.existsSync(localPath)) {
        return new Uint8Array(fs.default.readFileSync(localPath));
      }
    } catch (e) {
      // Ignore local read failures
    }
  }

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
  "Inter",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Open Sans",
  "Lato",
  "Oswald",
  "Raleway",
  "Nunito",
  "Ubuntu",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "PT Sans",
  "PT Serif",
  "Noto Sans",
  "Noto Serif",
  "Cabin",
  "Fira Sans",
  "Quicksand",
  "Josefin Sans",
  "Arimo",
  "Karla",
  "Inconsolata",
  "Source Code Pro",
];

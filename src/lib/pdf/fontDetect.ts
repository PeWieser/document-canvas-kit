// Font detection & loading for text replacement.
// Consolidated & fixed from the uploaded FontLoader betas.

const STANDARD = new Set(["sans-serif", "serif", "monospace"]);

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

/** Resolve a raw PDF font name (possibly subset-prefixed) to a friendly family + style. */
export function resolvePDFCoreFontName(fontName: string): ResolvedFont {
  if (!fontName) return { family: "Helvetica", isBold: false, isItalic: false };

  let cleanName = fontName;
  const plusIndex = cleanName.indexOf("+");
  if (plusIndex !== -1 && plusIndex < 7) cleanName = cleanName.substring(plusIndex + 1);

  const psNameMap: Record<string, string> = {
    TimesNewRomanPSMT: "Times New Roman",
    "TimesNewRomanPS-BoldMT": "Times New Roman",
    "TimesNewRomanPS-ItalicMT": "Times New Roman",
    "TimesNewRomanPS-BoldItalicMT": "Times New Roman",
    ArialMT: "Arial",
    "Arial-BoldMT": "Arial",
    "Arial-ItalicMT": "Arial",
    "Arial-BoldItalicMT": "Arial",
  };

  if (psNameMap[cleanName]) {
    cleanName = psNameMap[cleanName];
  } else {
    cleanName = cleanName.replace(/([a-z])([A-Z])/g, "$1 $2");
  }

  const lowerName = cleanName.toLowerCase();
  const isBold =
    lowerName.includes("bold") ||
    lowerName.includes("-bd") ||
    lowerName.includes(" bd") ||
    lowerName.endsWith("bd") ||
    lowerName.includes("heavy") ||
    lowerName.includes("black") ||
    lowerName.includes("semibold");
  const isItalic =
    lowerName.includes("italic") ||
    lowerName.includes("oblique") ||
    lowerName.includes("-it") ||
    lowerName.includes(" it");

  cleanName = cleanName
    .replace(/[-_ ]?(SemiBold|Bold|Italic|Oblique|Regular|Medium|Light|Heavy|Black|MT|Bd|It)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return { family: cleanName || "Helvetica", isBold, isItalic };
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

  try {
    let styleSuffix = "";
    if (isBold && isItalic) styleSuffix = ":700i";
    else if (isBold) styleSuffix = ":700";
    else if (isItalic) styleSuffix = ":400i";

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
      if (fontRes.ok) return new Uint8Array(await fontRes.arrayBuffer());
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

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, Replace, Trash2 } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { getPageTextItems, type PdfDocumentProxy, type LoadedTextItem } from "@/lib/pdf/pdfjs";
import type { Annotation, Rect, TextReplaceAnno } from "@/lib/pdf/types";
import { resolvePDFCoreFontName } from "@/lib/pdf/fontDetect";
import { cn } from "@/lib/utils";

export interface Hit {
  page: number;
  rect: Rect;
  snippet: string;
  targetItem: LoadedTextItem;
}

export interface ExtractedFontAndColor {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

export function extractFontAndColor(targetItem: LoadedTextItem | any): ExtractedFontAndColor {
  const transform = targetItem?.transform || [12, 0, 0, 12, 0, 0];
  const derivedFontSize =
    Math.hypot(transform[2], transform[3]) ||
    Math.hypot(transform[0], transform[1]) ||
    12;

  const fontSize = targetItem?.fontSize ?? derivedFontSize;

  let family = targetItem?.fontFamily;
  let bold = targetItem?.bold;
  let italic = targetItem?.italic;

  if (targetItem?.fontName) {
    const resolved = resolvePDFCoreFontName(targetItem.fontName);
    if (!family) family = resolved.family;
    if (bold === undefined) bold = resolved.isBold;
    if (italic === undefined) italic = resolved.isItalic;
  }

  return {
    fontFamily: family || "Helvetica",
    fontSize: fontSize || 12,
    bold: Boolean(bold),
    italic: Boolean(italic),
    color: targetItem?.color || "#111111",
  };
}

const uid = () => "anno-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);

function itemHitRects(
  it: LoadedTextItem,
  start: number,
  end: number,
): Rect | null {
  if (!it.str.length) return null;
  const tx = it.transform;
  const scaleY = Math.hypot(tx[2], tx[3]);
  const x0 = tx[4];
  const y0 = tx[5];
  const perChar = it.width / it.str.length;
  const height = it.height || scaleY || 12;
  const x = x0 + start * perChar;
  const y = y0;
  const w = Math.max(1, (end - start) * perChar);
  return { x, y, w, h: height };
}

export function SearchReplacePanel({ doc }: { doc: PdfDocumentProxy | null }) {
  const { t } = useI18n();
  const open = useEditor((s) => s.searchOpen);
  const setOpen = useEditor((s) => s.setSearchOpen);
  const pageOrder = useEditor((s) => s.pageOrder);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const deleteEmptyPages = useEditor((s) => s.deleteEmptyPages);

  const [q, setQ] = useState("");
  const [r, setR] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const runSearch = useCallback(async () => {
    if (!doc || !q.trim()) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      let re: RegExp;
      if (regex) {
        re = new RegExp(q, caseSensitive ? "g" : "gi");
      } else {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const src = wholeWord ? `\\b${escaped}\\b` : escaped;
        re = new RegExp(src, caseSensitive ? "g" : "gi");
      }
      const out: Hit[] = [];
      for (const pageId of pageOrder) {
        const page = await doc.getPage(pageId + 1);
        const items = await getPageTextItems(page);
        for (const it of items) {
          if (!it.str) continue;
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(it.str))) {
            const hitRect = itemHitRects(it, m.index, m.index + m[0].length);
            if (hitRect) {
              out.push({
                page: pageId,
                rect: hitRect,
                snippet: it.str.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20),
                targetItem: it,
              });
            }
            if (m[0].length === 0) re.lastIndex++;
          }
        }
      }
      setHits(out);
      setActive(0);
    } catch (e) {
      console.warn("search error", e);
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, [doc, q, caseSensitive, wholeWord, regex, pageOrder]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(runSearch, 200);
    return () => clearTimeout(timer);
  }, [open, runSearch]);

  const displayIndex = useMemo(() => {
    if (!hits[active]) return -1;
    return pageOrder.indexOf(hits[active].page);
  }, [hits, active, pageOrder]);

  const jump = (i: number) => {
    if (!hits[i]) return;
    setActive(i);
    const di = pageOrder.indexOf(hits[i].page);
    if (di >= 0) window.dispatchEvent(new CustomEvent("pdf-jump", { detail: di }));
  };

  const replaceHit = (hit: Hit) => {
    const extracted = extractFontAndColor(hit.targetItem);
    const anno: TextReplaceAnno = {
      id: uid(),
      kind: "textReplace",
      page: hit.page,
      rect: hit.rect,
      text: r,
      fontSize: extracted.fontSize,
      color: extracted.color,
      fontFamily: extracted.fontFamily,
      bold: extracted.bold,
      italic: extracted.italic,
      transform: hit.targetItem.transform,
      width: hit.rect.w,
      lineHeight: extracted.fontSize,
    };
    addAnnotation(anno);
  };

  const replaceAll = () => {
    for (const h of hits) {
      replaceHit(h);
    }
  };

  const handleDeleteEmptyPages = async () => {
    if (!doc) return;
    await deleteEmptyPages(doc);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div className="fixed right-2 top-16 z-40 flex w-[calc(100vw-1rem)] max-w-[360px] flex-col rounded-lg border bg-background shadow-xl md:right-4 md:top-20">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold flex-1">Suchen & Ersetzen</span>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-muted"
          title={t("close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search and Replace Inputs */}
      <div className="flex flex-col gap-2 p-3 border-b">
        <div className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-sm">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) jump((active - 1 + hits.length) % Math.max(1, hits.length));
                else jump((active + 1) % Math.max(1, hits.length));
              }
            }}
            placeholder={t("searchPlaceholder") || "Suchtext eingeben…"}
            className="flex-1 bg-transparent outline-none text-xs"
          />
        </div>
        <div className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 text-sm">
          <Replace className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            value={r}
            onChange={(e) => setR(e.target.value)}
            placeholder="Ersetzungstext…"
            className="flex-1 bg-transparent outline-none text-xs"
          />
        </div>
      </div>

      {/* Options Bar with Regex Toggle */}
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px]">
        <Chk on={caseSensitive} onChange={setCaseSensitive} label="Aa" title={t("matchCase")} />
        <Chk on={wholeWord} onChange={setWholeWord} label="W" title={t("wholeWord")} />
        <Chk on={regex} onChange={setRegex} label=".*" title="Regex" />
        <span className="ml-auto font-mono text-muted-foreground">
          {hits.length === 0 ? "Keine Treffer" : `${active + 1}/${hits.length}`}
        </span>
      </div>

      {/* Hit List */}
      <div className="max-h-52 overflow-y-auto">
        {hits.map((h, i) => {
          const di = pageOrder.indexOf(h.page);
          return (
            <div
              key={i}
              onClick={() => jump(i)}
              onDoubleClick={() => replaceHit(h)}
              className={cn(
                "flex w-full items-center justify-between gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer",
                i === active && "bg-accent",
              )}
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shrink-0">
                  {di + 1}
                </span>
                <span className="line-clamp-2 flex-1 text-foreground/80">…{h.snippet}…</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  replaceHit(h);
                }}
                className="shrink-0 rounded bg-primary/10 px-1.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/20"
                title="Ersetzen"
              >
                Ersetzen
              </button>
            </div>
          );
        })}
      </div>

      {/* Action Buttons: Replace All & Delete Empty Pages */}
      <div className="flex flex-col gap-2 border-t p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => hits[active] && replaceHit(hits[active])}
            disabled={!hits.length}
            className="flex-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
          >
            Ersetzen
          </button>
          <button
            onClick={replaceAll}
            disabled={!hits.length}
            className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Alle ersetzen ({hits.length})
          </button>
        </div>
        <button
          onClick={handleDeleteEmptyPages}
          className="flex items-center justify-center gap-1.5 w-full rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Leere Seiten löschen
        </button>
      </div>

      {displayIndex >= 0 && (
        <div className="border-t px-3 py-1 font-mono text-[10px] text-muted-foreground">
          {t("page")} {displayIndex + 1}
        </div>
      )}
    </div>
  );
}

function Chk({
  on,
  onChange,
  label,
  title,
}: {
  on: boolean;
  onChange: (b: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      title={title}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono font-bold text-[11px]",
        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
    </button>
  );
}

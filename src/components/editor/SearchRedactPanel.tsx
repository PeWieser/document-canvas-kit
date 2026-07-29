import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, TextCursorInput, Square, Check } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { getPageTextItems, type PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import type { Annotation, Rect } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";

interface Hit {
  page: number;
  rect: Rect;
  snippet: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// Estimate rect for a substring inside a pdf.js text item.
function itemHitRects(
  it: { str: string; transform: number[]; width: number; height: number },
  start: number,
  end: number,
): Rect | null {
  if (!it.str.length) return null;
  const tx = it.transform;
  const scaleX = Math.hypot(tx[0], tx[1]);
  const scaleY = Math.hypot(tx[2], tx[3]);
  const x0 = tx[4];
  const y0 = tx[5];
  const perChar = it.width / it.str.length;
  const height = it.height || scaleY;
  const x = x0 + start * perChar;
  const y = y0;
  const w = Math.max(1, (end - start) * perChar);
  void scaleX;
  return { x, y, w, h: height };
}

export function SearchRedactPanel({ doc }: { doc: PdfDocumentProxy | null }) {
  const { t } = useI18n();
  const open = useEditor((s) => s.searchOpen);
  const setOpen = useEditor((s) => s.setSearchOpen);
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const pageOrder = useEditor((s) => s.pageOrder);
  const addAnnotation = useEditor((s) => s.addAnnotation);

  const [activeTab, setActiveTab] = useState<"manual" | "search">("manual");
  const [q, setQ] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open && tool === "redact") {
      setActiveTab("manual");
    }
  }, [open, tool]);

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
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(it.str))) {
            const r = itemHitRects(it, m.index, m.index + m[0].length);
            if (r) {
              out.push({
                page: pageId,
                rect: r,
                snippet: it.str.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20),
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
    if (!open || activeTab !== "search") return;
    const t = setTimeout(runSearch, 200);
    return () => clearTimeout(t);
  }, [open, activeTab, runSearch]);

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

  const redactHit = (h: Hit) => {
    addAnnotation({ id: uid(), kind: "redact", page: h.page, rect: h.rect } as Annotation);
  };

  const redactAll = () => {
    for (const h of hits) redactHit(h);
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
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 font-medium text-xs text-foreground">
          <Square className="h-4 w-4 text-primary fill-primary/20" />
          <span>Schwärzungs-Panel</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-muted cursor-pointer"
          title={t("close")}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-muted/40 p-1 text-xs">
        <button
          onClick={() => {
            setActiveTab("manual");
            setTool("redact");
          }}
          className={cn(
            "flex-1 rounded-sm py-1.5 px-2 text-center font-medium transition-colors cursor-pointer",
            activeTab === "manual"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Manuell (Textauswahl)
        </button>
        <button
          onClick={() => setActiveTab("search")}
          className={cn(
            "flex-1 rounded-sm py-1.5 px-2 text-center font-medium transition-colors cursor-pointer",
            activeTab === "search"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Suchen & Schwärzen
        </button>
      </div>

      {/* Tab 1: Manuell (Textauswahl) */}
      {activeTab === "manual" && (
        <div className="p-4 space-y-3.5 text-xs text-foreground/90">
          <div className="flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <TextCursorInput className="h-5 w-5 shrink-0 text-primary mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-foreground text-xs">Textauswahl auf Canvas</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Streiche mit dem Textcursor direkt auf der PDF-Seite über Wörter oder Sätze, um sie zum Schwärzen zu markieren.
              </p>
            </div>
          </div>

          <div className="space-y-2 text-[11px] text-muted-foreground pl-1">
            <div className="flex items-start gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">1</span>
              <span>Text mit dem Cursor markieren oder Rahmen ziehen.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">2</span>
              <span>Schwärzungsbalken wird präzise platziert.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted font-mono text-[10px] font-bold text-foreground">3</span>
              <span>Beim PDF-Export werden die markierten Inhalte dauerhaft gelöscht.</span>
            </div>
          </div>

          {tool === "redact" ? (
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500/10 py-2 px-3 text-emerald-600 dark:text-emerald-400 text-[11px] font-medium border border-emerald-500/20">
              <Check className="h-3.5 w-3.5" />
              <span>Schwärzungs-Modus aktiv</span>
            </div>
          ) : (
            <button
              onClick={() => setTool("redact")}
              className="w-full rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer"
            >
              Schwärzen-Werkzeug aktivieren
            </button>
          )}
        </div>
      )}

      {/* Tab 2: Suchen & Schwärzen */}
      {activeTab === "search" && (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
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
              placeholder={t("searchPlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none"
            />
            {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[11px]">
            <Chk on={caseSensitive} onChange={setCaseSensitive} label={t("matchCase")} />
            <Chk on={wholeWord} onChange={setWholeWord} label={t("wholeWord")} />
            <Chk on={regex} onChange={setRegex} label={t("regex")} />
            <span className="ml-auto font-mono text-muted-foreground">
              {hits.length === 0 ? t("noMatches") : `${active + 1}/${hits.length}`}
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {hits.map((h, i) => {
              const di = pageOrder.indexOf(h.page);
              return (
                <div
                  key={i}
                  onClick={() => jump(i)}
                  onDoubleClick={() => redactHit(h)}
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
                      redactHit(h);
                    }}
                    className="shrink-0 rounded bg-destructive/10 px-1.5 py-1 text-[10px] font-medium text-destructive hover:bg-destructive/20 cursor-pointer"
                    title={t("redactCurrent")}
                  >
                    {t("redact")}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 border-t p-2">
            <button
              onClick={() => hits[active] && redactHit(hits[active])}
              disabled={!hits.length}
              className="flex-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              {t("redactCurrent")}
            </button>
            <button
              onClick={redactAll}
              disabled={!hits.length}
              className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 cursor-pointer"
            >
              {t("redactAll")} ({hits.length})
            </button>
          </div>
          {displayIndex >= 0 && (
            <div className="border-t px-3 py-1 font-mono text-[10px] text-muted-foreground">
              {t("page")} {displayIndex + 1}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Chk({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono uppercase cursor-pointer",
        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
    </button>
  );
}

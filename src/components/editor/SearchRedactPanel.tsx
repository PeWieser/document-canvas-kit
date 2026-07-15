import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
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
  const pageOrder = useEditor((s) => s.pageOrder);
  const addAnnotation = useEditor((s) => s.addAnnotation);

  const [q, setQ] = useState("");
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
    if (!open) return;
    const t = setTimeout(runSearch, 200);
    return () => clearTimeout(t);
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
    <div className="fixed right-4 top-20 z-40 flex w-[340px] flex-col rounded-lg border bg-background shadow-xl">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
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
        <button
          onClick={() => setOpen(false)}
          className="rounded p-1 hover:bg-muted"
          title={t("close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
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
            <button
              key={i}
              onClick={() => jump(i)}
              onDoubleClick={() => redactHit(h)}
              className={cn(
                "flex w-full items-start gap-2 border-b px-3 py-1.5 text-left text-xs hover:bg-muted",
                i === active && "bg-accent",
              )}
            >
              <span className="mt-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {di + 1}
              </span>
              <span className="line-clamp-2 flex-1 text-foreground/80">…{h.snippet}…</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t p-2">
        <button
          onClick={() => hits[active] && redactHit(hits[active])}
          disabled={!hits.length}
          className="flex-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
        >
          {t("redactCurrent")}
        </button>
        <button
          onClick={redactAll}
          disabled={!hits.length}
          className="flex-1 rounded-md bg-destructive px-2 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
        >
          {t("redactAll")} ({hits.length})
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
}: {
  on: boolean;
  onChange: (b: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono uppercase",
        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
      )}
    >
      {label}
    </button>
  );
}

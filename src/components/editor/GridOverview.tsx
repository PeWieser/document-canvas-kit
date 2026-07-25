import { useState, useRef, useEffect } from "react";
import { X, Trash2, Plus, Minus } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { PageThumb } from "./PageThumb";
import { cn } from "@/lib/utils";

export function GridOverview({
  doc,
  onJump,
}: {
  doc: PdfDocumentProxy;
  onJump: (index: number) => void;
}) {
  const { t } = useI18n();
  const open = useEditor((s) => s.gridOpen);
  const setGridOpen = useEditor((s) => s.setGridOpen);
  const pageOrder = useEditor((s) => s.pageOrder);
  const reorderPages = useEditor((s) => s.reorderPages);
  const deletePage = useEditor((s) => s.deletePage);
  const pagesPerRow = useEditor((s) => s.pagesPerRow ?? 4);
  const setPagesPerRow = useEditor((s) => s.setPagesPerRow);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<"before" | "after" | null>(null);
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);

  // Touch Long-Press Drag State (1 second hold on mobile)
  const [touchDragging, setTouchDragging] = useState<number | null>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);

  const isDragging = dragFrom !== null || touchDragging !== null;

  // Wheel listener for Ctrl + Scroll to adjust pagesPerRow
  useEffect(() => {
    const modalEl = modalRef.current;
    if (!modalEl || !open) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const current = useEditor.getState().pagesPerRow ?? 4;
        if (e.deltaY > 0) {
          setPagesPerRow(current + 1);
        } else if (e.deltaY < 0) {
          setPagesPerRow(current - 1);
        }
      }
    };

    modalEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      modalEl.removeEventListener("wheel", handleWheel);
    };
  }, [open, setPagesPerRow]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      navigator.vibrate?.(50);
      setDragFrom(index);
      setTouchDragging(index);
      setTouchPos({ x: touch.clientX, y: touch.clientY });
    }, 1000);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    if (touchDragging === null && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 10 || dy > 10) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      }
      return;
    }

    if (touchDragging !== null) {
      e.preventDefault();
      setTouchPos({ x: touch.clientX, y: touch.clientY });

      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (
          touch.clientX >= rect.left &&
          touch.clientX <= rect.right &&
          touch.clientY >= rect.top &&
          touch.clientY <= rect.bottom
        ) {
          if (i !== touchDragging) {
            setDragOver(i);
            setDropTarget(i < touchDragging ? "before" : "after");
            setDropSide(i < touchDragging ? "left" : "right");
          }
          break;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (touchDragging !== null && dragOver !== null && touchDragging !== dragOver) {
      let targetIndex = touchDragging;
      if (dragOver < touchDragging) {
        targetIndex = dropTarget === "before" ? dragOver : dragOver + 1;
      } else if (dragOver > touchDragging) {
        targetIndex = dropTarget === "before" ? dragOver - 1 : dragOver;
      }
      if (targetIndex !== touchDragging) {
        reorderPages(touchDragging, targetIndex);
      }
    }

    setTouchDragging(null);
    setTouchPos(null);
    setDragFrom(null);
    setDragOver(null);
    setDropTarget(null);
    setDropSide(null);
  };

  const handleParentDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragFrom === null) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    let targetIndex: number | null = null;
    const element = document.elementFromPoint(clientX, clientY);
    if (element) {
      const itemEl = element.closest("[data-grid-item-index]");
      if (itemEl) {
        const idxStr = itemEl.getAttribute("data-grid-item-index");
        if (idxStr !== null) {
          targetIndex = parseInt(idxStr, 10);
        }
      }
    }

    if (targetIndex === null && itemRefs.current.length > 0) {
      let minDistance = Infinity;
      let closestIndex = 0;
      itemRefs.current.forEach((el, idx) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - centerX, clientY - centerY);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = idx;
        }
      });
      targetIndex = closestIndex;
    }

    if (targetIndex !== null && itemRefs.current[targetIndex]) {
      const el = itemRefs.current[targetIndex]!;
      const rect = el.getBoundingClientRect();
      const side: "left" | "right" = clientX < rect.left + rect.width / 2 ? "left" : "right";
      const dropTgt: "before" | "after" = side === "left" ? "before" : "after";

      if (dragOver !== targetIndex || dropTarget !== dropTgt || dropSide !== side) {
        setDragOver(targetIndex);
        setDropTarget(dropTgt);
        setDropSide(side);
      }
    }
  };

  const handleParentDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragFrom !== null && dragOver !== null && dropTarget !== null) {
      let targetIndex = dragFrom;
      if (dragOver < dragFrom) {
        targetIndex = dropTarget === "before" ? dragOver : dragOver + 1;
      } else if (dragOver > dragFrom) {
        targetIndex = dropTarget === "before" ? dragOver - 1 : dragOver;
      }
      if (targetIndex !== dragFrom) {
        reorderPages(dragFrom, targetIndex);
      }
    }
    setDragFrom(null);
    setDragOver(null);
    setDropTarget(null);
    setDropSide(null);
  };

  return (
    <div ref={modalRef} className="fixed inset-0 z-[200] flex flex-col bg-background/95 backdrop-blur select-none">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">{t("gridView")}</h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            (Lange drücken zum Umsortieren per Touch)
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border-r border-border pr-4">
            <span className="text-xs text-muted-foreground font-mono w-28 text-right font-medium">
              {pagesPerRow} Seiten / Zeile
            </span>
            <button
              type="button"
              onClick={() => setPagesPerRow(pagesPerRow - 1)}
              disabled={pagesPerRow <= 1}
              className="flex items-center justify-center border border-border bg-card shadow-2xs hover:bg-muted text-foreground p-1.5 rounded-md disabled:opacity-40 transition-colors cursor-pointer"
              data-testid="pages-per-row-minus"
              aria-label="Fewer pages per row"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={pagesPerRow}
              onChange={(e) => setPagesPerRow(Number(e.target.value))}
              className="w-24 sm:w-36 cursor-pointer accent-primary"
              data-testid="matrix-zoom-slider"
              aria-label="Pages per row"
            />
            <button
              type="button"
              onClick={() => setPagesPerRow(pagesPerRow + 1)}
              disabled={pagesPerRow >= 8}
              className="flex items-center justify-center border border-border bg-card shadow-2xs hover:bg-muted text-foreground p-1.5 rounded-md disabled:opacity-40 transition-colors cursor-pointer"
              data-testid="pages-per-row-plus"
              aria-label="More pages per row"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setGridOpen(false)}
            className="flex items-center justify-center border border-border bg-card shadow-2xs hover:bg-muted text-foreground p-1.5 rounded-md transition-colors cursor-pointer"
            aria-label="Close grid overview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onDragOver={handleParentDragOver}
        onDrop={handleParentDrop}
        className="grid flex-1 overflow-y-auto p-6 gap-4"
        style={{
          gridTemplateColumns: `repeat(${pagesPerRow}, minmax(0, 1fr))`,
        }}
        data-testid="grid-container"
      >
        {pageOrder.map((pageId, index) => (
          <div
            key={pageId}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            data-grid-item-index={index}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
              setDropTarget(null);
              setDropSide(null);
            }}
            onTouchStart={(e) => handleTouchStart(index, e)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={cn(
              "group relative p-2.5 outline-none rounded-lg transition-transform duration-150",
              touchDragging === index && "opacity-40 scale-95",
            )}
            data-testid={`grid-item-${index}`}
          >
            {/* Drop indicator line */}
            {dragOver === index &&
              dragFrom !== null &&
              dragFrom !== index &&
              dropTarget !== null &&
              dropSide !== null &&
              !(dragFrom === index - 1 && dropTarget === "before") &&
              !(dragFrom === index + 1 && dropTarget === "after") && (
                <div
                  className={cn(
                    "absolute z-50 bg-primary rounded-full pointer-events-none top-2.5 bottom-2.5 w-1 shadow-md"
                  )}
                  style={{
                    left: dropSide === "left" ? "-0.625rem" : undefined,
                    right: dropSide === "right" ? "-0.625rem" : undefined,
                  }}
                  data-testid="drop-indicator"
                />
              )}
            <div
              onClick={() => {
                if (touchDragging === null) {
                  onJump(index);
                  setGridOpen(false);
                }
              }}
              className={cn(
                "relative cursor-pointer rounded-lg border-2 bg-card p-2 shadow-sm transition group-hover:shadow-md border-border",
                isDragging && "pointer-events-none"
              )}
              title={t("reorderHint")}
            >
              <PageThumb doc={doc} pageId={pageId} width={240} />
              <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-xs text-muted-foreground">
                <span>{index + 1}</span>
              </div>
              {pageOrder.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(index);
                  }}
                  className="absolute right-2 top-2 rounded-md bg-destructive p-1.5 text-destructive-foreground opacity-90 sm:opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Floating Drag Avatar for Touch Mode */}
      {touchDragging !== null && touchPos && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg border-2 border-primary bg-card p-2 shadow-2xl opacity-90"
          style={{
            left: touchPos.x - 60,
            top: touchPos.y - 80,
            width: 120,
          }}
        >
          <PageThumb doc={doc} pageId={pageOrder[touchDragging]} width={100} />
          <div className="mt-1 text-center font-mono text-[10px] font-bold text-primary">
            Seite {touchDragging + 1}
          </div>
        </div>
      )}
    </div>
  );
}


import { useState, useRef, useEffect } from "react";
import { X, Trash2 } from "lucide-react";
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

    // 1-second (1000ms) long-press threshold
    timerRef.current = setTimeout(() => {
      navigator.vibrate?.(50);
      setDragFrom(index);
      setTouchDragging(index);
      setTouchPos({ x: touch.clientX, y: touch.clientY });
    }, 1000);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    // If long-press hasn't triggered yet, check if user scrolled (> 10px movement)
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

    // Active long-press dragging mode
    if (touchDragging !== null) {
      e.preventDefault();
      setTouchPos({ x: touch.clientX, y: touch.clientY });

      // Find element under touch point
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur select-none">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t("gridView")}</h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            (Lange drücken zum Umsortieren per Touch)
          </span>
        </div>
        <button onClick={() => setGridOpen(false)} className="rounded-md p-2 hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid flex-1 grid-cols-2 overflow-y-auto p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {pageOrder.map((pageId, index) => (
          <div
            key={pageId}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const side: "left" | "right" = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
              const target: "before" | "after" = side === "left" ? "before" : "after";

              if (dragOver !== index || dropTarget !== target || dropSide !== side) {
                setDragOver(index);
                setDropTarget(target);
                setDropSide(side);
              }
            }}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== index && dropTarget !== null) {
                let targetIndex = dragFrom;
                if (index < dragFrom) {
                  targetIndex = dropTarget === "before" ? index : index + 1;
                } else if (index > dragFrom) {
                  targetIndex = dropTarget === "before" ? index - 1 : index;
                }
                if (targetIndex !== dragFrom) {
                  reorderPages(dragFrom, targetIndex);
                }
              }
              setDragFrom(null);
              setDragOver(null);
              setDropTarget(null);
              setDropSide(null);
            }}
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
              "group relative p-2 outline-none rounded-lg transition-transform duration-150",
              touchDragging === index && "opacity-40 scale-95",
            )}
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
                    "absolute z-50 bg-primary rounded-full pointer-events-none top-2 bottom-2 w-1",
                    dropSide === "left" ? "-left-[6px] -translate-x-1/2" : "-right-[6px] translate-x-1/2",
                  )}
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
              )}
              title={t("reorderHint")}
            >
              <PageThumb doc={doc} pageId={pageId} width={220} />
              <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-xs text-muted-foreground">
                <span>{index + 1}</span>
              </div>
              {pageOrder.length > 1 && (
                <button
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

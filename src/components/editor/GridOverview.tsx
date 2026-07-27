import { useState, useRef, useEffect } from "react";
import { X, Trash2, Plus, Minus, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { PageThumb } from "./PageThumb";
import { cn } from "@/lib/utils";

export function calculateDropInsertionIndex(
  itemRect: { left: number; right: number },
  clientX: number,
  itemIndex: number,
): number {
  const midpoint = (itemRect.left + itemRect.right) / 2;
  return clientX < midpoint ? itemIndex : itemIndex + 1;
}

export function getActivePasteSlot(
  dropInsertionIndex: number | null,
  selectedIndices: Set<number>,
  lastClickedIndex: number | null,
  totalPages: number,
): number {
  if (dropInsertionIndex !== null) {
    return dropInsertionIndex;
  }
  if (selectedIndices.size > 0) {
    const maxSelected = Math.max(...Array.from(selectedIndices));
    return maxSelected + 1;
  }
  if (lastClickedIndex !== null) {
    return lastClickedIndex + 1;
  }
  return totalPages;
}

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
  const reorderMultiplePages = useEditor((s) => s.reorderMultiplePages);
  const duplicatePages = useEditor((s) => s.duplicatePages);
  const deletePage = useEditor((s) => s.deletePage);
  const pagesPerRow = useEditor((s) => s.pagesPerRow ?? 4);
  const setPagesPerRow = useEditor((s) => s.setPagesPerRow);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);

  const [clipboard, setClipboard] = useState<{ mode: "copy" | "cut"; indices: number[] } | null>(null);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<"before" | "after" | null>(null);
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const [dropInsertionIndex, setDropInsertionIndex] = useState<number | null>(null);

  // Touch Long-Press Drag State (1 second hold on mobile)
  const [touchDragging, setTouchDragging] = useState<number | null>(null);
  const [touchPos, setTouchPos] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const modalRef = useRef<HTMLDivElement>(null);
  const dragFromRef = useRef<number | null>(null);
  // Native HTML drag can emit a click after dragend. Suppress that click so
  // finishing a reorder cannot trigger the normal "jump and close" action.
  const suppressClickAfterDragRef = useRef(false);

  const isDragging = dragFrom !== null || touchDragging !== null;

  const [activePasteSlot, setActivePasteSlot] = useState<number | null>(null);
  const [isGathered, setIsGathered] = useState(false);
  const [dragOffsets, setDragOffsets] = useState<{ dx: number; dy: number }[]>([]);

  // Listen to window keydown for Clipboard Shortcuts (Ctrl+C, Ctrl+X, Ctrl+V)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === "c") {
        if (selectedIndices.size === 0) return;
        e.preventDefault();
        const indices = Array.from(selectedIndices).sort((a, b) => a - b);
        setClipboard({ mode: "copy", indices });
        toast(`${indices.length} Seiten kopiert`);
      } else if (isCtrl && e.key.toLowerCase() === "x") {
        if (selectedIndices.size === 0) return;
        e.preventDefault();
        const indices = Array.from(selectedIndices).sort((a, b) => a - b);
        setClipboard({ mode: "cut", indices });
        toast(`${indices.length} Seiten ausgeschnitten`);
      } else if (isCtrl && e.key.toLowerCase() === "v") {
        if (!clipboard || clipboard.indices.length === 0) return;
        e.preventDefault();

        let targetInsertion: number;
        if (activePasteSlot !== null) {
          targetInsertion = activePasteSlot;
        } else if (dropInsertionIndex !== null) {
          targetInsertion = dropInsertionIndex;
        } else if (selectedIndices.size > 0) {
          const maxSelected = Math.max(...Array.from(selectedIndices));
          targetInsertion = maxSelected + 1;
        } else if (lastClickedIndex !== null) {
          targetInsertion = lastClickedIndex + 1;
        } else {
          targetInsertion = pageOrder.length;
        }

        if (clipboard.mode === "copy") {
          duplicatePages(clipboard.indices, targetInsertion);
          setActivePasteSlot(targetInsertion + clipboard.indices.length);
        } else if (clipboard.mode === "cut") {
          reorderMultiplePages(clipboard.indices, targetInsertion);
          setClipboard(null);
          setActivePasteSlot(targetInsertion);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    open,
    selectedIndices,
    clipboard,
    activePasteSlot,
    dropInsertionIndex,
    lastClickedIndex,
    pageOrder.length,
    duplicatePages,
    reorderMultiplePages,
  ]);

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

  useEffect(() => {
    if (isDragging) {
      const rAF = requestAnimationFrame(() => {
        setIsGathered(true);
      });
      return () => cancelAnimationFrame(rAF);
    } else {
      setIsGathered(false);
    }
  }, [isDragging]);

  if (!open) return null;

  type MeasuredGridItem = {
    index: number;
    rect: DOMRect;
  };

  const isNoopInsertionIndex = (from: number | null, insertionIndex: number) =>
    from !== null && (insertionIndex === from || insertionIndex === from + 1);

  const getInsertionIndexAtPoint = (
    clientX: number,
    clientY: number,
    from: number | null,
  ): number | null => {
    const items: MeasuredGridItem[] = [];
    itemRefs.current.slice(0, pageOrder.length).forEach((el, index) => {
      if (el) items.push({ index, rect: el.getBoundingClientRect() });
    });

    if (items.length === 0) return null;

    const rows: MeasuredGridItem[][] = [];
    for (let i = 0; i < items.length; i += pagesPerRow) {
      rows.push(items.slice(i, i + pagesPerRow));
    }

    let nearestRow = rows[0];
    let nearestRowDistance = Infinity;

    for (const row of rows) {
      const top = Math.min(...row.map((item) => item.rect.top));
      const bottom = Math.max(...row.map((item) => item.rect.bottom));
      const centerY = (top + bottom) / 2;
      const outsideDistance =
        clientY < top ? top - clientY : clientY > bottom ? clientY - bottom : 0;
      // Use a tiny center tie-breaker so vertical gaps are split stably between rows.
      const distance = outsideDistance + Math.abs(clientY - centerY) * 0.001;

      if (distance < nearestRowDistance) {
        nearestRowDistance = distance;
        nearestRow = row;
      }
    }

    const sortedRow = [...nearestRow].sort((a, b) => a.rect.left - b.rect.left);
    let insertionIndex = sortedRow[0].index;
    for (const item of sortedRow) {
      const centerX = (item.rect.left + item.rect.right) / 2;
      if (clientX < centerX) {
        insertionIndex = item.index;
        break;
      } else {
        insertionIndex = item.index + 1;
      }
    }

    if (isNoopInsertionIndex(from, insertionIndex)) {
      return null;
    }

    return insertionIndex;
  };

  const captureDragOffsets = (pointerX: number, pointerY: number, activeIndices: Set<number> | number[]) => {
    const indices = Array.from(activeIndices).sort((a, b) => a - b);
    const offsets = indices.map((idx) => {
      const el = itemRefs.current[idx];
      if (!el) return { dx: 0, dy: 0 };
      const rect = el.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      return {
        dx: cardCenterX - pointerX,
        dy: cardCenterY - pointerY,
      };
    });
    setDragOffsets(offsets);
    setIsGathered(false);
  };

  const resetDropState = () => {
    setDragOver(null);
    setDropTarget(null);
    setDropSide(null);
    setDropInsertionIndex(null);
  };

  const getTargetIndexFromInsertionIndex = (from: number, insertionIndex: number) =>
    insertionIndex > from ? insertionIndex - 1 : insertionIndex;

  const updateDropStateAtPoint = (
    clientX: number,
    clientY: number,
    sourceIndex: number | null = dragFromRef.current ?? dragFrom ?? touchDragging,
  ) => {
    // Drag events can arrive before React has committed the dragFrom state
    // update. Always prefer the ref (set in dragstart) so the first dragover
    // already computes a real drop slot instead of clearing the indicator.
    const insertionIndex = getInsertionIndexAtPoint(clientX, clientY, sourceIndex);
    if (insertionIndex === null || pageOrder.length === 0) {
      resetDropState();
      return;
    }

    const targetIndex = Math.min(insertionIndex, pageOrder.length - 1);
    const dropTgt: "before" | "after" = insertionIndex >= pageOrder.length ? "after" : "before";
    const side: "left" | "right" = dropTgt === "before" ? "left" : "right";

    if (
      dragOver !== targetIndex ||
      dropTarget !== dropTgt ||
      dropSide !== side ||
      dropInsertionIndex !== insertionIndex
    ) {
      setDragOver(targetIndex);
      setDropTarget(dropTgt);
      setDropSide(side);
      setDropInsertionIndex(insertionIndex);
    }
  };

  const handleItemClick = (index: number, e: React.MouseEvent) => {
    setActivePasteSlot(null);
    if (e.ctrlKey || e.metaKey) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
      setLastClickedIndex(index);
    } else if (e.shiftKey) {
      const start = lastClickedIndex !== null ? lastClickedIndex : 0;
      const min = Math.min(start, index);
      const max = Math.max(start, index);
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        for (let i = min; i <= max; i++) {
          next.add(i);
        }
        return next;
      });
    } else {
      setLastClickedIndex(index);
      onJump(index);
      setGridOpen(false);
    }
  };

  const handleTouchStart = (index: number, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      navigator.vibrate?.(50);
      setDragFrom(index);
      setTouchDragging(index);
      setTouchPos({ x: touch.clientX, y: touch.clientY });
      const targetIndices = selectedIndices.has(index) ? selectedIndices : new Set([index]);
      if (!selectedIndices.has(index) && selectedIndices.size > 0) {
        setSelectedIndices(new Set([index]));
        setLastClickedIndex(index);
      }
      captureDragOffsets(touch.clientX, touch.clientY, targetIndices);
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

      updateDropStateAtPoint(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (touchDragging !== null && dropInsertionIndex !== null) {
      if (selectedIndices.size > 1 && selectedIndices.has(touchDragging)) {
        reorderMultiplePages(Array.from(selectedIndices), dropInsertionIndex);
      } else {
        const targetIndex = getTargetIndexFromInsertionIndex(touchDragging, dropInsertionIndex);
        if (targetIndex !== touchDragging) {
          reorderPages(touchDragging, targetIndex);
        }
      }
    }

    setTouchDragging(null);
    setTouchPos(null);
    setDragFrom(null);
    setDragPos(null);
    resetDropState();
  };

  const handleParentDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      try { e.dataTransfer.dropEffect = "move"; } catch {}
    }
    if (e.nativeEvent && (e.nativeEvent as any).dataTransfer) {
      try { (e.nativeEvent as any).dataTransfer.dropEffect = "move"; } catch {}
    }
    setDragPos({ x: e.clientX, y: e.clientY });
    const activeFrom = dragFromRef.current ?? dragFrom;
    if (activeFrom === null) return;

    updateDropStateAtPoint(e.clientX, e.clientY, activeFrom);
  };

  const handleParentDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const fromIdx = dragFromRef.current ?? dragFrom;
    if (fromIdx === null) return;

    const targetInsertion =
      dropInsertionIndex !== null
        ? dropInsertionIndex
        : getInsertionIndexAtPoint(e.clientX, e.clientY, fromIdx);

    if (targetInsertion !== null) {
      const activeSelected =
        selectedIndices.size > 0 && selectedIndices.has(fromIdx)
          ? Array.from(selectedIndices)
          : [fromIdx];

      if (activeSelected.length > 1) {
        reorderMultiplePages(activeSelected, targetInsertion);
      } else {
        const targetIndex = getTargetIndexFromInsertionIndex(fromIdx, targetInsertion);
        if (targetIndex !== fromIdx) {
          reorderPages(fromIdx, targetIndex);
        }
      }
    }

    dragFromRef.current = null;
    setDragFrom(null);
    setDragPos(null);
    resetDropState();
  };

  const activeDragPos = touchPos ?? dragPos;

  return (
    <div
      ref={modalRef}
      className={cn(
        "fixed inset-0 z-200 flex flex-col bg-background/95 backdrop-blur select-none",
        isDragging && "cursor-move [&_*]:cursor-move",
      )}
    >
      <div className="flex items-center justify-between border-b px-5 py-3">
        {selectedIndices.size > 0 ? (
          <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-md px-3 py-1.5 text-sm font-medium text-primary">
            <span>{selectedIndices.size} Seiten ausgewählt</span>
            <button
              type="button"
              onClick={() => {
                setSelectedIndices(new Set());
                setLastClickedIndex(null);
              }}
              className="text-xs underline hover:no-underline text-foreground cursor-pointer"
              data-testid="deselect-all-btn"
            >
              Auswahl aufheben
            </button>
            <button
              type="button"
              onClick={() => {
                const sorted = Array.from(selectedIndices).sort((a, b) => b - a);
                sorted.forEach((idx) => deletePage(idx));
                setSelectedIndices(new Set());
                setLastClickedIndex(null);
              }}
              className="flex items-center gap-1 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 px-2 py-1 rounded transition-colors cursor-pointer"
              data-testid="delete-selected-btn"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Ausgewählte löschen
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">{t("gridView")}</h2>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              (Lange drücken zum Umsortieren per Touch)
            </span>
          </div>
        )}

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
        onClick={(e) => {
          if (!isDragging && dragFromRef.current === null) {
            const slot = getInsertionIndexAtPoint(e.clientX, e.clientY, null);
            if (slot !== null) {
              setActivePasteSlot((prev) => (prev === slot ? null : slot));
            } else {
              setActivePasteSlot(null);
            }
          }
        }}
        onDragOver={handleParentDragOver}
        onDrop={handleParentDrop}
        className="grid flex-1 overflow-y-auto p-6 gap-4"
        style={{
          gridTemplateColumns: `repeat(${pagesPerRow}, minmax(0, 1fr))`,
        }}
        data-testid="grid-container"
      >
        {pageOrder.map((pageId, index) => {
          const isSelected = selectedIndices.has(index);
          const isGreyedOut = isDragging && (dragFrom === index || selectedIndices.has(index));
          const showActivePasteLine =
            !isDragging &&
            activePasteSlot !== null &&
            (activePasteSlot === index || (activePasteSlot === pageOrder.length && index === pageOrder.length - 1));
          const pasteLineSide = showActivePasteLine
            ? activePasteSlot === index
              ? "left"
              : "right"
            : null;

          return (
            <div
              key={`${pageId}-${index}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              data-grid-item-index={index}
              draggable
              onDragStart={(e) => {
                suppressClickAfterDragRef.current = true;
                dragFromRef.current = index;
                if (e.dataTransfer) {
                  const transparentCanvas = document.createElement("canvas");
                  transparentCanvas.width = 1;
                  transparentCanvas.height = 1;
                  e.dataTransfer.setDragImage(transparentCanvas, 0, 0);
                }
                setDragFrom(index);
                setDragPos({ x: e.clientX, y: e.clientY });
                const activeIndices = selectedIndices.has(index) ? selectedIndices : new Set([index]);
                if (!selectedIndices.has(index) && selectedIndices.size > 0) {
                  setSelectedIndices(new Set([index]));
                  setLastClickedIndex(index);
                }
                captureDragOffsets(e.clientX, e.clientY, activeIndices);
                resetDropState();
              }}
              onDragEnd={() => {
                setTimeout(() => {
                  dragFromRef.current = null;
                  setDragFrom(null);
                  setDragPos(null);
                  resetDropState();
                }, 50);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (e.dataTransfer) {
                  try { e.dataTransfer.dropEffect = "move"; } catch {}
                }
                setDragPos({ x: e.clientX, y: e.clientY });
                const activeFrom = dragFromRef.current ?? dragFrom;
                if (activeFrom !== null) {
                  updateDropStateAtPoint(e.clientX, e.clientY, activeFrom);
                }
              }}
              onTouchStart={(e) => handleTouchStart(index, e)}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={cn(
                "group relative p-2.5 outline-none rounded-lg transition-transform duration-150",
                touchDragging === index && "scale-95",
              )}
              data-testid={`grid-item-${index}`}
              data-selected={isSelected ? "true" : "false"}
              data-dragging={isGreyedOut ? "true" : "false"}
            >
              {/* Drop / Active paste indicator line */}
              {((dragOver === index && dragFrom !== null && dropTarget !== null && dropSide !== null) || showActivePasteLine) && (
                <div
                  className={cn(
                    "absolute z-50 bg-primary rounded-full pointer-events-none top-2.5 bottom-2.5 w-1 shadow-md",
                  )}
                  style={{
                    left: (dropSide ?? pasteLineSide) === "left" ? "-0.625rem" : undefined,
                    right: (dropSide ?? pasteLineSide) === "right" ? "-0.625rem" : undefined,
                  }}
                  data-testid="drop-indicator"
                />
              )}
              <div
                onClick={(e) => {
                  if (suppressClickAfterDragRef.current) {
                    e.preventDefault();
                    e.stopPropagation();
                    suppressClickAfterDragRef.current = false;
                    return;
                  }
                  if (touchDragging === null && !isDragging && dragFromRef.current === null) {
                    handleItemClick(index, e);
                  }
                }}
                className={cn(
                  "relative cursor-pointer rounded-lg border-2 bg-card p-2 shadow-sm transition group-hover:shadow-md border-border",
                  isSelected && "ring-2 ring-primary bg-primary/10",
                  isGreyedOut && "opacity-30 grayscale saturate-0 border-dashed border-muted-foreground/40 bg-muted/20 shadow-none ring-0",
                )}
                title={t("reorderHint")}
              >
                {isSelected && !isGreyedOut && (
                  <CheckCircle2 className="h-5 w-5 text-primary absolute top-2 left-2 z-20 fill-background" />
                )}
                <PageThumb doc={doc} pageId={pageId} pagesPerRow={pagesPerRow} />
                <div className="mt-1.5 flex items-center justify-center gap-1 font-mono text-xs text-muted-foreground">
                  <span>{index + 1}</span>
                </div>
                {pageOrder.length > 1 && !isGreyedOut && (
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
          );
        })}
      </div>

      {/* 100% Solid Floating Drag Avatar (Multi-Page: Apple 3D Stacked Cards) */}
      {isDragging && activeDragPos && selectedIndices.size > 1 && (
        <div
          className="fixed z-300 pointer-events-none select-none opacity-100 shadow-2xl"
          style={{
            left: activeDragPos.x - 100,
            top: activeDragPos.y - 120,
            width: 200,
          }}
          data-testid="stacked-drag-avatar"
        >
          <div className="relative w-full">
            {/* Card 3 (Bottom) */}
            <div
              className="absolute inset-0 rounded-lg border-2 border-primary/40 bg-card p-2 shadow-md"
              style={{
                transform: isGathered
                  ? "translate3d(0, 0, 0) rotate(4deg) translateY(-10px) translateX(6px)"
                  : `translate3d(${dragOffsets[2]?.dx ?? dragOffsets[0]?.dx ?? 0}px, ${dragOffsets[2]?.dy ?? dragOffsets[0]?.dy ?? 0}px, 0)`,
                opacity: 0.85,
                transition: "transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out",
              }}
            >
              <div className="w-full aspect-3/4 bg-muted/40 rounded" />
            </div>

            {/* Card 2 (Middle) */}
            <div
              className="absolute inset-0 rounded-lg border-2 border-primary/60 bg-card p-2 shadow-lg"
              style={{
                transform: isGathered
                  ? "translate3d(0, 0, 0) rotate(-5deg) translateY(-5px) translateX(-4px)"
                  : `translate3d(${dragOffsets[1]?.dx ?? dragOffsets[0]?.dx ?? 0}px, ${dragOffsets[1]?.dy ?? dragOffsets[0]?.dy ?? 0}px, 0)`,
                opacity: 0.9,
                transition: "transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out",
              }}
            >
              <div className="w-full aspect-3/4 bg-muted/40 rounded" />
            </div>

            {/* Card 1 (Top) */}
            <div
              className="relative rounded-lg border-2 border-primary bg-card p-2 shadow-2xl opacity-100"
              style={{
                transform: isGathered
                  ? "translate3d(0, 0, 0)"
                  : `translate3d(${dragOffsets[0]?.dx ?? 0}px, ${dragOffsets[0]?.dy ?? 0}px, 0)`,
                transition: "transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out",
              }}
            >
              <PageThumb
                doc={doc}
                pageId={pageOrder[dragFrom ?? touchDragging ?? Array.from(selectedIndices)[0]] ?? pageOrder[0]}
                pagesPerRow={pagesPerRow}
              />
              <div className="absolute -top-2.5 -right-2.5 rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-lg">
                {selectedIndices.size} Seiten
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 100% Solid Floating Drag Avatar (Single Page) */}
      {isDragging && activeDragPos && selectedIndices.size <= 1 && (
        <div
          className="fixed z-300 pointer-events-none select-none rounded-lg border-2 border-primary bg-card p-2 shadow-2xl opacity-100"
          style={{
            left: activeDragPos.x - 100,
            top: activeDragPos.y - 120,
            width: 200,
            transform: isGathered
              ? "translate3d(0, 0, 0)"
              : `translate3d(${dragOffsets[0]?.dx ?? 0}px, ${dragOffsets[0]?.dy ?? 0}px, 0)`,
            transition: "transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 200ms ease-out",
          }}
          data-testid="single-drag-avatar"
        >
          <PageThumb
            doc={doc}
            pageId={pageOrder[dragFrom ?? touchDragging ?? 0] ?? pageOrder[0]}
            pagesPerRow={pagesPerRow}
          />
          <div className="mt-1.5 text-center font-mono text-xs font-bold text-primary">
            Seite {(dragFrom ?? touchDragging ?? 0) + 1}
          </div>
        </div>
      )}
    </div>
  );
}

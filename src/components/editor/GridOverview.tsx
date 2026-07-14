import { useState } from "react";
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
  const [dropSide, setDropSide] = useState<"left" | "right" | "top" | "bottom" | null>(null);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-lg font-semibold">{t("gridView")}</h2>
        <button onClick={() => setGridOpen(false)} className="rounded-md p-2 hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid flex-1 grid-cols-2 overflow-y-auto p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {pageOrder.map((pageId, index) => (
          <div
            key={pageId}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const dx = e.clientX - (rect.left + rect.width / 2);
              const dy = e.clientY - (rect.top + rect.height / 2);

              // Compare normalized distances to determine if it is a horizontal or vertical drag-over
              const isHorizontal = Math.abs(dx * rect.height) > Math.abs(dy * rect.width);
              let target: "before" | "after";
              let side: "left" | "right" | "top" | "bottom";

              if (isHorizontal) {
                target = dx < 0 ? "before" : "after";
                side = dx < 0 ? "left" : "right";
              } else {
                target = dy < 0 ? "before" : "after";
                side = dy < 0 ? "top" : "bottom";
              }

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
            className="group relative p-2 outline-none"
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
                    "absolute z-50 bg-primary rounded-full pointer-events-none",
                    dropSide === "left" || dropSide === "right"
                      ? "top-2 bottom-2 w-1"
                      : "left-2 right-2 h-1",
                    dropSide === "left" && "left-0 -translate-x-0.5",
                    dropSide === "right" && "right-0 translate-x-0.5",
                    dropSide === "top" && "top-0 -translate-y-0.5",
                    dropSide === "bottom" && "bottom-0 translate-y-0.5",
                  )}
                />
              )}
            <div
              onClick={() => {
                onJump(index);
                setGridOpen(false);
              }}
              className={cn(
                "relative cursor-pointer rounded-lg border-2 bg-card p-2 shadow-sm transition group-hover:shadow-md border-border",
              )}
              title={t("reorderHint")}
            >
              <PageThumb doc={doc} pageId={pageId} width={220} />
              <div className="mt-1.5 text-center font-mono text-xs text-muted-foreground">
                {index + 1}
              </div>
              {pageOrder.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(index);
                  }}
                  className="absolute right-2 top-2 rounded-md bg-destructive p-1 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

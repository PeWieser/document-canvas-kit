import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { PageThumb } from "./PageThumb";
import { cn } from "@/lib/utils";

export function ThumbnailRail({
  doc,
  activeIndex,
  onJump,
}: {
  doc: PdfDocumentProxy;
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  const { t } = useI18n();
  const pageOrder = useEditor((s) => s.pageOrder);
  const sidebarOpen = useEditor((s) => s.sidebarOpen);
  const reorderPages = useEditor((s) => s.reorderPages);
  const deletePage = useEditor((s) => s.deletePage);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Keep the active thumbnail focused (scrolled to the top when possible).
  useEffect(() => {
    if (!sidebarOpen) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex, sidebarOpen]);

  if (!sidebarOpen) return null;

  return (
    <aside className="flex w-[140px] shrink-0 flex-col border-r border-border bg-sidebar select-none">
      <div className="flex items-center justify-between px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{t("pages")}</span>
        <span className="font-mono text-xs">{pageOrder.length}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-4 scrollbar-thin">
        {pageOrder.map((pageId, index) => (
          <div
            key={pageId}
            ref={activeIndex === index ? activeRef : undefined}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(index);
            }}
            onDrop={() => {
              if (dragFrom !== null && dragFrom !== index) reorderPages(dragFrom, index);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onClick={() => onJump(index)}
            className={cn(
              "group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-lg p-1.5 transition duration-200",
              dragOver === index && dragFrom !== null && "bg-accent/40",
              activeIndex === index ? "bg-accent/30" : "hover:bg-accent/15"
            )}
            title={t("reorderHint")}
          >
            <div
              className={cn(
                "relative flex-1 w-full rounded-md border bg-background overflow-hidden transition-all duration-200 shadow-2xs",
                activeIndex === index 
                  ? "border-primary ring-1 ring-primary/45 shadow-xs" 
                  : "border-border/80 group-hover:border-primary/30"
              )}
            >
              <PageThumb doc={doc} pageId={pageId} />
              {pageOrder.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(index);
                  }}
                  className="absolute right-1 top-1 rounded-md bg-destructive/90 p-1 text-destructive-foreground opacity-0 backdrop-blur-xs transition hover:bg-destructive group-hover:opacity-100 shadow-sm"
                  title={t("deletePage")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            {/* Subtle, small page index badge at bottom */}
            <span className={cn(
              "text-[10px] font-mono transition-colors duration-200",
              activeIndex === index ? "text-primary font-bold" : "text-muted-foreground"
            )}>
              {index + 1}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

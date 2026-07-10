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
    <aside className="flex w-[180px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span>{t("pages")}</span>
        <span className="font-mono">{pageOrder.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
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
              "group relative flex cursor-pointer items-stretch gap-2 rounded-md p-1 transition",
              dragOver === index && dragFrom !== null && "bg-accent/60",
            )}
            title={t("reorderHint")}
          >
            {/* active blue bar */}
            <span
              className={cn(
                "w-1 shrink-0 rounded-full transition-colors",
                activeIndex === index ? "bg-primary" : "bg-transparent",
              )}
            />
            <div
              className={cn(
                "relative flex-1 rounded-sm ring-1 transition",
                activeIndex === index ? "ring-primary" : "ring-border group-hover:ring-primary/40",
              )}
            >
              <PageThumb doc={doc} pageId={pageId} />
              <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1 font-mono text-[10px] text-background">
                {index + 1}
              </span>
              {pageOrder.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(index);
                  }}
                  className="absolute right-1 top-1 rounded bg-destructive p-0.5 text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                  title={t("deletePage")}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

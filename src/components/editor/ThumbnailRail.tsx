import { useState } from "react";
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
  const reorderPages = useEditor((s) => s.reorderPages);
  const deletePage = useEditor((s) => s.deletePage);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <aside className="flex w-[172px] shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground">
        <span>{t("pages")}</span>
        <span className="font-mono">{pageOrder.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {pageOrder.map((pageId, index) => (
          <div
            key={pageId}
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
              "group relative cursor-pointer rounded-md border p-1 transition",
              activeIndex === index
                ? "border-primary ring-1 ring-primary"
                : "border-transparent hover:border-border",
              dragOver === index && dragFrom !== null && "border-primary/60",
            )}
            title={t("reorderHint")}
          >
            <PageThumb doc={doc} pageId={pageId} />
            <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">
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
        ))}
      </div>
    </aside>
  );
}

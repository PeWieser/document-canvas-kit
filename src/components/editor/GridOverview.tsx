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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-lg font-semibold">{t("gridView")}</h2>
        <button
          onClick={() => setGridOpen(false)}
          className="rounded-md p-2 hover:bg-muted"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
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
            onClick={() => {
              onJump(index);
              setGridOpen(false);
            }}
            className={cn(
              "group relative cursor-pointer rounded-lg border-2 bg-card p-2 shadow-sm transition hover:shadow-md",
              dragOver === index && dragFrom !== null ? "border-primary" : "border-border",
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
        ))}
      </div>
    </div>
  );
}

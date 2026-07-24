import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { PageThumb } from "./PageThumb";
import { cn } from "@/lib/utils";

interface Menu {
  x: number;
  y: number;
  displayIndex: number;
}

export function ThumbnailRail({
  doc,
  activeIndex,
  onJump,
  onExportPages,
  onCropPages,
}: {
  doc: PdfDocumentProxy;
  activeIndex: number;
  onJump: (index: number) => void;
  onExportPages: (displayIndices: number[]) => void;
  onCropPages: (displayIndices: number[]) => void;
}) {
  const { t } = useI18n();
  const pageOrder = useEditor((s) => s.pageOrder);
  const sidebarOpen = useEditor((s) => s.sidebarOpen);
  const reorderPages = useEditor((s) => s.reorderPages);
  const deletePage = useEditor((s) => s.deletePage);
  const selectedPages = useEditor((s) => s.selectedPages);
  const toggleSelectedPage = useEditor((s) => s.toggleSelectedPage);
  const setSelectedPages = useEditor((s) => s.setSelectedPages);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<"before" | "after" | null>(null);
  const [dropSide, setDropSide] = useState<"left" | "right" | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex, sidebarOpen]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  if (!sidebarOpen) return null;

  const targetsFor = (di: number) =>
    selectedPages.includes(di) && selectedPages.length > 1 ? [...selectedPages].sort((a, b) => a - b) : [di];

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-[220px] max-w-[80vw] shrink-0 flex-col border-r border-sidebar-border bg-sidebar/85 backdrop-blur-md shadow-2xl transition-all duration-200 select-none md:relative md:inset-auto md:z-auto md:w-[140px] md:shadow-none animate-sidebar-slide">
      <div className="flex items-center justify-between px-3 py-3.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{t("pages")}</span>
        <span className="font-mono text-xs">{pageOrder.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-4 scrollbar-thin">
        {pageOrder.map((pageId, index) => {
          const isSelected = selectedPages.includes(index);
          return (
            <div
              key={pageId}
              ref={activeIndex === index ? activeRef : undefined}
              draggable
              onDragStart={() => setDragFrom(index)}
              onDragOver={(e) => {
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const side: "left" | "right" = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
                const targetPos: "before" | "after" = side === "left" ? "before" : "after";
                if (dragOver !== index || dropTarget !== targetPos || dropSide !== side) {
                  setDragOver(index);
                  setDropTarget(targetPos);
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
              onClick={(e) => {
                if (e.shiftKey) {
                  toggleSelectedPage(index, "range");
                } else if (e.ctrlKey || e.metaKey) {
                  toggleSelectedPage(index, "toggle");
                } else {
                  setSelectedPages([]);
                  onJump(index);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selectedPages.includes(index)) {
                  toggleSelectedPage(index, "single");
                }
                setMenu({ x: e.clientX, y: e.clientY, displayIndex: index });
              }}
              className="group cursor-pointer relative py-1.5 outline-none"
              title={t("reorderHint")}
            >
              {dragOver === index &&
                dragFrom !== null &&
                dragFrom !== index &&
                dropTarget !== null &&
                dropSide !== null &&
                !(dragFrom === index - 1 && dropTarget === "before") &&
                !(dragFrom === index + 1 && dropTarget === "after") && (
                  <div
                    className={cn(
                      "absolute z-50 bg-primary rounded-full pointer-events-none top-1 bottom-1 w-1",
                      dropSide === "left" ? "-left-1 -translate-x-1/2" : "-right-1 translate-x-1/2",
                    )}
                  />
                )}
              <div
                className={cn(
                  "relative flex flex-col items-center gap-1.5 rounded-lg p-1.5 transition duration-200",
                  activeIndex === index ? "bg-accent/30" : "group-hover:bg-accent/15",
                  isSelected && "ring-1 ring-primary/60 bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "relative flex-1 w-full rounded-md border bg-background overflow-hidden transition-all duration-200 shadow-2xs",
                    activeIndex === index
                      ? "border-primary ring-1 ring-primary/45 shadow-xs"
                      : "border-border/80 group-hover:border-primary/30",
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
                <span
                  className={cn(
                    "text-[10px] font-mono transition-colors duration-200",
                    activeIndex === index ? "text-primary font-bold" : "text-muted-foreground",
                  )}
                >
                  {index + 1}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {menu && (
        <div
          className="fixed z-[200] min-w-[220px] rounded-md border bg-popover py-1 text-popover-foreground shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem
            label={
              selectedPages.length > 1
                ? `${t("ctxExportSelected")} (${selectedPages.length})`
                : t("ctxExportPage")
            }
            onClick={() => {
              onExportPages(targetsFor(menu.displayIndex));
              setMenu(null);
            }}
          />
          <MenuItem
            label={t("ctxCropPage")}
            onClick={() => {
              onCropPages(targetsFor(menu.displayIndex));
              setMenu(null);
            }}
          />
          <div className="my-1 h-px bg-border" />
          <MenuItem
            label={t("deletePage")}
            danger
            onClick={() => {
              const targets = targetsFor(menu.displayIndex).sort((a, b) => b - a);
              for (const di of targets) deletePage(di);
              setSelectedPages([]);
              setMenu(null);
            }}
          />
        </div>
      )}
    </aside>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full px-3 py-1.5 text-left text-xs hover:bg-accent",
        danger && "text-destructive hover:bg-destructive/10",
      )}
    >
      {label}
    </button>
  );
}

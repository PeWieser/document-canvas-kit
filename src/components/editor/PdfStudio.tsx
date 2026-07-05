import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { exportPdf, downloadBytes } from "@/lib/pdf/export";
import type { Tool } from "@/lib/pdf/types";
import { DropZone } from "./DropZone";
import { Toolbar } from "./Toolbar";
import { ThumbnailRail } from "./ThumbnailRail";
import { GridOverview } from "./GridOverview";
import { PageView } from "./PageView";

export function PdfStudio() {
  const { t } = useI18n();
  const fileName = useEditor((s) => s.fileName);
  const originalBytes = useEditor((s) => s.originalBytes);
  const pageOrder = useEditor((s) => s.pageOrder);
  const loadDoc = useEditor((s) => s.loadDoc);
  const setTool = useEditor((s) => s.setTool);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const selectedId = useEditor((s) => s.selectedId);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const select = useEditor((s) => s.select);
  const setGridOpen = useEditor((s) => s.setGridOpen);

  const { doc, error } = useLoadedPdf(originalBytes);
  const [exporting, setExporting] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dark, setDark] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleFile = useCallback(
    async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      try {
        const probe = await loadPdfDocument(buf.buffer.slice(0) as ArrayBuffer);
        loadDoc(file.name, buf, probe.numPages);
      } catch {
        toast.error(t("exportFail"));
      }
    },
    [loadDoc, t],
  );

  const openPicker = () => inputRef.current?.click();

  const handleExport = useCallback(async () => {
    if (!originalBytes) return;
    setExporting(true);
    try {
      const bytes = await exportPdf(
        originalBytes,
        useEditor.getState().pageOrder,
        useEditor.getState().annotations,
      );
      const name = (fileName || "document.pdf").replace(/\.pdf$/i, "") + "-edited.pdf";
      downloadBytes(bytes, name);
      toast.success(t("exportDone"));
    } catch (e) {
      console.error(e);
      toast.error(t("exportFail"));
    } finally {
      setExporting(false);
    }
  }, [originalBytes, fileName, t]);

  const jumpTo = useCallback((index: number) => {
    pageRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveIndex(index);
  }, []);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  // active page tracking
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !doc) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            setActiveIndex(idx);
          }
        }
      },
      { root, threshold: 0.5 },
    );
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [doc, pageOrder]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleExport();
        return;
      }
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom(useEditor.getState().zoom + 0.15);
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        setZoom(useEditor.getState().zoom - 0.15);
        return;
      }
      if (typing || mod) return;

      if (e.key === "Escape") {
        select(null);
        setGridOpen(false);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeAnnotation(selectedId);
        return;
      }
      const map: Record<string, Tool> = {
        v: "select",
        h: "highlight",
        r: "redact",
        e: "edit-text",
        t: "textbox",
        p: "pen",
        c: "comment",
      };
      const tl = map[e.key.toLowerCase()];
      if (tl) setTool(tl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleExport, undo, redo, setZoom, select, setGridOpen, selectedId, removeAnnotation, setTool]);

  if (!originalBytes) {
    return (
      <div className="flex min-h-screen flex-col">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files && handleFile(e.target.files[0])}
        />
        <DropZone onFile={handleFile} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => e.target.files && handleFile(e.target.files[0])}
      />
      <Toolbar
        onExport={handleExport}
        onOpen={openPicker}
        exporting={exporting}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
      <div className="flex min-h-0 flex-1">
        {doc && (
          <ThumbnailRail doc={doc} activeIndex={activeIndex} onJump={jumpTo} />
        )}
        <main
          ref={scrollRef}
          className="flex-1 overflow-auto bg-desk"
          onClick={() => select(null)}
        >
          {error && (
            <div className="p-8 text-center text-destructive">{t("exportFail")}</div>
          )}
          {!doc && !error && (
            <div className="p-8 text-center text-muted-foreground">{t("loading")}</div>
          )}
          {doc && (
            <div className="flex flex-col items-center gap-6 py-8">
              {pageOrder.map((pageId, index) => (
                <div
                  key={pageId}
                  data-index={index}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <PageView doc={doc} pageId={pageId} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      {doc && <GridOverview doc={doc} onJump={jumpTo} />}
    </div>
  );
}

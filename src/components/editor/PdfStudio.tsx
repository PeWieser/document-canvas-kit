import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { PageView, clearGlobalFontCache } from "./PageView";
import { TwoPageView } from "./TwoPageView";
import { CommentsPanel } from "./CommentsPanel";
import { SearchRedactPanel } from "./SearchRedactPanel";
import { CropToolPanel } from "./CropToolPanel";
import { FeedbackWidget } from "./FeedbackWidget";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const PAGE_PAD = 32; // px of breathing room around a fit page

export function PdfStudio() {
  const { t } = useI18n();
  const fileName = useEditor((s) => s.fileName);
  const originalBytes = useEditor((s) => s.originalBytes);
  const pageOrder = useEditor((s) => s.pageOrder);
  const zoom = useEditor((s) => s.zoom);
  const viewMode = useEditor((s) => s.viewMode);
  const estimateSize = useEditor((s) => s.estimateSize);
  const currentPage = useEditor((s) => s.currentPage);
  const loadDoc = useEditor((s) => s.loadDoc);
  const setTool = useEditor((s) => s.setTool);
  const setZoom = useEditor((s) => s.setZoom);
  const setCurrentPage = useEditor((s) => s.setCurrentPage);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const selectedId = useEditor((s) => s.selectedId);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const select = useEditor((s) => s.select);
  const setGridOpen = useEditor((s) => s.setGridOpen);
  const sidebarOpen = useEditor((s) => s.sidebarOpen);
  const commentsPanelOpen = useEditor((s) => s.commentsPanelOpen);
  const toggleSidebar = useEditor((s) => s.toggleSidebar);
  const toggleCommentsPanel = useEditor((s) => s.toggleCommentsPanel);

  const { doc, error } = useLoadedPdf(originalBytes);
  const [exporting, setExporting] = useState(false);
  const [dark, setDark] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const setSelectedPages = useEditor((s) => s.setSelectedPages);
  const currentTool = useEditor((s) => s.tool);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [visible, setVisible] = useState<Set<number>>(new Set([0, 1, 2]));
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevZoomRef = useRef(zoom);
  const loadBytes = useCallback(
    async (name: string, buf: Uint8Array, handle: FileSystemFileHandle | null) => {
      try {
        const probe = await loadPdfDocument(buf.buffer.slice(0) as ArrayBuffer);
        const p1 = await probe.getPage(1);
        const vp = p1.getViewport({ scale: 1 });
        clearGlobalFontCache();
        loadDoc(name, buf, probe.numPages, { w: vp.width, h: vp.height }, handle);
      } catch {
        toast.error(t("exportFail"));
      }
    },
    [loadDoc, t],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      await loadBytes(file.name, buf, null);
    },
    [loadBytes],
  );

  const openPicker = useCallback(async () => {
    const w = window as any;
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker({
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const file = await handle.getFile();
        const buf = new Uint8Array(await file.arrayBuffer());
        await loadBytes(file.name, buf, handle);
        return;
      } catch {
        return; // user cancelled
      }
    }
    inputRef.current?.click();
  }, [loadBytes]);

  const buildBytes = useCallback(async () => {
    if (!originalBytes) return null;
    return exportPdf(
      originalBytes,
      useEditor.getState().pageOrder,
      useEditor.getState().annotations,
    );
  }, [originalBytes]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const bytes = await buildBytes();
      if (!bytes) return;
      const name = (fileName || "document.pdf").replace(/\.pdf$/i, "") + "-edited.pdf";
      downloadBytes(bytes, name);
      toast.success(t("exportDone"));
    } catch (e) {
      console.error(e);
      toast.error(t("exportFail"));
    } finally {
      setExporting(false);
    }
  }, [buildBytes, fileName, t]);

  const handleExportPages = useCallback(
    async (displayIndices: number[]) => {
      if (!originalBytes || displayIndices.length === 0) return;
      setExporting(true);
      try {
        const order = displayIndices.map((i) => useEditor.getState().pageOrder[i]);
        const bytes = await exportPdf(originalBytes, order, useEditor.getState().annotations);
        const suffix = displayIndices.length === 1 ? `p${displayIndices[0] + 1}` : `${displayIndices.length}pages`;
        const name = (fileName || "document.pdf").replace(/\.pdf$/i, "") + `-${suffix}.pdf`;
        downloadBytes(bytes, name);
        toast.success(t("exportDone"));
      } catch (e) {
        console.error(e);
        toast.error(t("exportFail"));
      } finally {
        setExporting(false);
      }
    },
    [originalBytes, fileName, t],
  );

  const writeToHandle = useCallback(
    async (handle: FileSystemFileHandle, bytes: Uint8Array) => {
      const writable = await (handle as any).createWritable();
      await writable.write(bytes);
      await writable.close();
      useEditor.getState().markSaved(bytes);
      toast.success(t("saved"));
    },
    [t],
  );

  const handleSave = useCallback(async () => {
    setExporting(true);
    try {
      const bytes = await buildBytes();
      if (!bytes) return;
      const handle = useEditor.getState().fileHandle;
      if (handle && (handle as any).createWritable) {
        await writeToHandle(handle, bytes);
      } else {
        const name = fileName || "document.pdf";
        downloadBytes(bytes, name);
        toast.message(t("saveUnsupported"));
      }
    } catch (e) {
      console.error(e);
      toast.error(t("exportFail"));
    } finally {
      setExporting(false);
    }
  }, [buildBytes, fileName, writeToHandle, t]);

  const handleSaveAs = useCallback(async () => {
    setExporting(true);
    try {
      const bytes = await buildBytes();
      if (!bytes) return;
      const w = window as any;
      if (w.showSaveFilePicker) {
        const handle = await w.showSaveFilePicker({
          suggestedName: fileName || "document.pdf",
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        await writeToHandle(handle, bytes);
        useEditor.getState().setFileHandle(handle);
      } else {
        downloadBytes(bytes, fileName || "document.pdf");
        toast.message(t("saveUnsupported"));
      }
    } catch {
      /* cancelled */
    } finally {
      setExporting(false);
    }
  }, [buildBytes, fileName, writeToHandle, t]);

  const handleQuit = useCallback(() => {
    if (useEditor.getState().dirty && !window.confirm(t("quitConfirm"))) return;
    window.close();
    // window.close() is a no-op for tabs not opened by script; reset instead.
    setTimeout(() => useEditor.getState().closeDoc(), 50);
  }, [t]);

  const handlePrint = useCallback(async () => {
    const tid = toast.loading(t("preparingPrint") || "Preparing print...");
    try {
      const bytes = await buildBytes();
      if (!bytes) {
        toast.dismiss(tid);
        return;
      }
      const blob = new Blob([bytes as any], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        toast.dismiss(tid);
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }, 2000);
      };
    } catch (e) {
      console.error(e);
      toast.dismiss(tid);
      toast.error(t("printFail") || "Print failed");
    }
  }, [buildBytes, t]);

  useKeyboardShortcuts({
    onSave: handleSave,
    onExport: handleExport,
    onOpenShortcuts: () => setShortcutsOpen(true),
    onCloseShortcuts: () => setShortcutsOpen(false),
    isShortcutsOpen: shortcutsOpen,
  });

  const selectAllPDFText = useCallback(() => {
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    const textLayers = document.querySelectorAll(".pdf-text-layer");
    if (textLayers.length === 0) return;
    const firstLayer = textLayers[0];
    const lastLayer = textLayers[textLayers.length - 1];

    let firstNode = firstLayer.firstChild;
    while (firstNode && firstNode.nodeType !== Node.TEXT_NODE && firstNode.firstChild) {
      firstNode = firstNode.firstChild;
    }
    let lastNode = lastLayer.lastChild;
    while (lastNode && lastNode.nodeType !== Node.TEXT_NODE && lastNode.lastChild) {
      lastNode = lastNode.lastChild;
    }

    if (firstNode && lastNode) {
      const range = document.createRange();
      range.setStart(firstNode, 0);
      range.setEnd(lastNode, lastNode.textContent?.length || 0);
      selection.addRange(range);
    } else {
      const range = document.createRange();
      range.setStartBefore(firstLayer);
      range.setEndAfter(lastLayer);
      selection.addRange(range);
    }
  }, []);

  const jumpTo = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(pageOrder.length - 1, index));
      setCurrentPage(clamped);
      if (viewMode !== "two-page") {
        pageRefs.current[clamped]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [pageOrder.length, setCurrentPage, viewMode],
  );

  useEffect(() => {
    const onJump = (e: Event) => jumpTo((e as CustomEvent<number>).detail);
    window.addEventListener("pdf-jump", onJump as EventListener);
    return () => window.removeEventListener("pdf-jump", onJump as EventListener);
  }, [jumpTo]);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  };

  // measure container
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("vite_chunk_reloaded");
    }
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [doc]);

  // recompute zoom for fit modes (without flipping to "custom")
  useEffect(() => {
    if (!estimateSize || containerSize.w === 0) return;
    let z: number | null = null;
    if (viewMode === "fit-width") {
      z = (containerSize.w - PAGE_PAD * 2) / estimateSize.w;
    } else if (viewMode === "fit-height") {
      z = (containerSize.h - PAGE_PAD * 2) / estimateSize.h;
    } else if (viewMode === "two-page") {
      const zw = (containerSize.w - PAGE_PAD * 3) / (estimateSize.w * 2);
      const zh = (containerSize.h - PAGE_PAD * 2) / estimateSize.h;
      z = Math.min(zw, zh);
    }
    if (z && z > 0 && Math.abs(z - zoom) > 0.001) {
      useEditor.setState({ zoom: Math.min(6, Math.max(0.1, z)) });
    }
  }, [viewMode, containerSize, estimateSize, zoom]);

  // page slot pixel dims (estimate)
  const slotDims = useMemo(() => {
    if (!estimateSize) return { w: 600, h: 800 };
    return { w: estimateSize.w * zoom, h: estimateSize.h * zoom };
  }, [estimateSize, zoom]);

  // virtualization: which slots are mounted
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !doc || viewMode === "two-page") return;
    const io = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (e.isIntersecting) next.add(idx);
            else next.delete(idx);
          }
          return next;
        });
      },
      { root, rootMargin: "800px 0px" },
    );
    pageRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [doc, pageOrder, viewMode, slotDims.h]);

  // active page tracking on scroll
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !doc || viewMode === "two-page") return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = root.scrollTop + root.clientHeight * 0.35;
        let best = 0;
        let bestDist = Infinity;
        pageRefs.current.forEach((el, i) => {
          if (!el) return;
          const center = el.offsetTop + el.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        setCurrentPage(best);
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [doc, pageOrder, viewMode, setCurrentPage]);

  // smooth scroll zoom zentriert auf Cursor
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const el = scrollRef.current;
        if (!el) return;
        const zoomFactor = 1.08;
        const oldZoom = useEditor.getState().zoom;
        let newZoom = oldZoom;
        if (e.deltaY < 0) {
          newZoom = Math.min(6, oldZoom * zoomFactor);
        } else {
          newZoom = Math.max(0.1, oldZoom / zoomFactor);
        }
        if (Math.abs(newZoom - oldZoom) > 0.001) {
          const rect = el.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const docX = el.scrollLeft + mouseX;
          const docY = el.scrollTop + mouseY;

          const ratio = newZoom / oldZoom;
          const targetLeft = docX * ratio - mouseX;
          const targetTop = docY * ratio - mouseY;

          // Prevent the general zoom effect from running on this change
          prevZoomRef.current = newZoom;

          useEditor.setState({ zoom: newZoom, viewMode: "custom" });

          requestAnimationFrame(() => {
            el.scrollLeft = targetLeft;
            el.scrollTop = targetTop;
          });
        }
      }
    };
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, []);

  // Mobile Touch Pinch-to-Zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let initialDist = 0;
    let initialZoom = 1;

    const getDist = (e: TouchEvent) => {
      if (e.touches.length < 2) return 0;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.hypot(dx, dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDist = getDist(e);
        initialZoom = useEditor.getState().zoom;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDist > 0) {
        e.preventDefault();
        const dist = getDist(e);
        if (dist > 0) {
          const ratio = dist / initialDist;
          const newZoom = Math.min(6, Math.max(0.2, initialZoom * ratio));
          prevZoomRef.current = newZoom;
          useEditor.setState({ zoom: newZoom, viewMode: "custom" });
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        initialDist = 0;
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Track zoom changes to keep viewport center stable for button/keyboard zooms
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      prevZoomRef.current = zoom;
      return;
    }
    const oldZoom = prevZoomRef.current;
    if (oldZoom !== zoom) {
      prevZoomRef.current = zoom;
      if (Math.abs(zoom - oldZoom) > 0.001) {
        const centerDocY = el.scrollTop + el.clientHeight / 2;
        const centerDocX = el.scrollLeft + el.clientWidth / 2;

        const ratio = zoom / oldZoom;
        const targetTop = centerDocY * ratio - el.clientHeight / 2;
        const targetLeft = centerDocX * ratio - el.clientWidth / 2;

        requestAnimationFrame(() => {
          el.scrollTop = targetTop;
          el.scrollLeft = targetLeft;
        });
      }
    }
  }, [zoom]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        handlePrint();
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        selectAllPDFText();
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
        t: "edit-text",
        x: "textbox",
        p: "pen",
        c: "comment",
      };
      const tl = map[e.key.toLowerCase()];
      if (tl) setTool(tl);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    handleSave,
    handlePrint,
    selectAllPDFText,
    undo,
    redo,
    setZoom,
    select,
    setGridOpen,
    selectedId,
    removeAnnotation,
    setTool,
  ]);

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
        onOpen={openPicker}
        onExport={handleExport}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onQuit={handleQuit}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        exporting={exporting}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
      <div className="flex min-h-0 flex-1 relative">
        {doc && sidebarOpen && (
          <div
            onClick={() => toggleSidebar()}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          />
        )}
        {doc && commentsPanelOpen && (
          <div
            onClick={() => toggleCommentsPanel()}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden"
          />
        )}
        {doc && (
          <ThumbnailRail
            doc={doc}
            activeIndex={currentPage}
            onJump={jumpTo}
            onExportPages={handleExportPages}
            onCropPages={(pages) => {
              setSelectedPages(pages);
              setTool("crop");
            }}
          />
        )}
        <main ref={scrollRef} className="flex-1 overflow-auto bg-desk" onClick={() => select(null)}>
          {error && <div className="p-8 text-center text-destructive">{t("exportFail")}</div>}
          {!doc && !error && (
            <div className="p-8 text-center text-muted-foreground">{t("loading")}</div>
          )}
          {doc && viewMode === "two-page" && (
            <TwoPageView doc={doc} onSelectClear={() => select(null)} />
          )}
          {doc && viewMode !== "two-page" && (
            <div
              className="flex flex-col items-center"
              style={{ gap: PAGE_PAD, paddingBlock: PAGE_PAD }}
            >
              {pageOrder.map((pageId, index) => (
                <div
                  key={pageId}
                  data-index={index}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                  style={{
                    width: slotDims.w,
                    minHeight: slotDims.h,
                    contentVisibility: visible.has(index) ? "visible" : "hidden",
                    containIntrinsicSize: `${slotDims.w}px ${slotDims.h}px`
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <PageView doc={doc} pageId={pageId} />
                </div>
              ))}
            </div>
          )}
        </main>
        <CommentsPanel onJump={jumpTo} />
        <SearchRedactPanel doc={doc ?? null} />
      </div>
      {doc && currentTool === "crop" && <CropToolPanel doc={doc} />}
      {doc && <GridOverview doc={doc} onJump={jumpTo} />}
      <FeedbackWidget />
      <ShortcutsPanel isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}

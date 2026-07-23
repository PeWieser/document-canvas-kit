import { useEditor } from "@/store/editorStore";
import {
  FileText,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
  Grid,
} from "lucide-react";

export function StatusBar() {
  const fileName = useEditor((s) => s.fileName);
  const dirty = useEditor((s) => s.dirty);
  const numPages = useEditor((s) => s.numPages);
  const currentPage = useEditor((s) => s.currentPage);
  const zoom = useEditor((s) => s.zoom);
  const gridOpen = useEditor((s) => s.gridOpen);
  const viewMode = useEditor((s) => s.viewMode);

  const setCurrentPage = useEditor((s) => s.setCurrentPage);
  const setZoom = useEditor((s) => s.setZoom);

  const displayPage = numPages > 0 ? currentPage + 1 : 0;
  const zoomPercent = Math.round(zoom * 100);

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < numPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  return (
    <footer className="h-8 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between text-xs text-slate-400 select-none shrink-0 z-20">
      {/* Left: Document Name & Dirty Status */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-medium text-slate-300 truncate max-w-[200px]" title={fileName || "No document loaded"}>
            {fileName || "No document loaded"}
          </span>
        </div>

        {fileName && (
          <div className="flex items-center gap-1">
            {dirty ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-semibold border border-amber-500/20">
                <AlertCircle className="w-3 h-3" />
                Unsaved
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-medium border border-emerald-500/20">
                <CheckCircle2 className="w-3 h-3" />
                Saved
              </span>
            )}
          </div>
        )}
      </div>

      {/* Center: Page Navigation */}
      <div className="flex items-center gap-2">
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 0}
          className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
          title="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span className="font-mono text-slate-300">
          Page <span className="font-semibold text-white">{displayPage}</span> of {numPages}
        </span>

        <button
          onClick={handleNextPage}
          disabled={currentPage >= numPages - 1}
          className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 transition-colors"
          title="Next Page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right: View Mode, Grid & Zoom Controls */}
      <div className="flex items-center gap-3">
        {gridOpen && (
          <span className="flex items-center gap-1 text-[10px] text-blue-400 font-medium">
            <Grid className="w-3 h-3" />
            Grid Overview
          </span>
        )}

        <span className="capitalize text-slate-400 hidden sm:inline">{viewMode}</span>

        <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
          <button
            onClick={() => setZoom(zoom - 0.1)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono font-medium text-slate-200 w-10 text-center">
            {zoomPercent}%
          </span>

          <button
            onClick={() => setZoom(zoom + 0.1)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
}

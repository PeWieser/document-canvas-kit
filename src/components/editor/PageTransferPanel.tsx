import React, { useState } from "react";
import { Copy, ArrowRightLeft, FileCheck, Layers, X } from "lucide-react";
import { useDocumentStore } from "@/store/documentStore";
import { toast } from "sonner";

interface PageTransferPanelProps {
  onClose?: () => void;
}

export function PageTransferPanel({ onClose }: PageTransferPanelProps) {
  const documents = useDocumentStore((s) => s.documents);
  const activeDocId = useDocumentStore((s) => s.activeDocId);
  const tabOrder = useDocumentStore((s) => s.tabOrder);
  const copyPagesBetweenDocs = useDocumentStore((s) => s.copyPagesBetweenDocs);

  const activeDoc = activeDocId ? documents.get(activeDocId) : null;

  const [sourceId, setSourceId] = useState<string>(activeDocId || "");
  const [targetId, setTargetId] = useState<string>(
    tabOrder.find((id) => id !== activeDocId) || "",
  );
  const [pageSelection, setPageSelection] = useState<"current" | "selected" | "all">("current");
  const [transferMode, setTransferMode] = useState<"copy" | "move">("copy");
  const [insertPos, setInsertPos] = useState<"end" | "start">("end");

  const sourceDoc = documents.get(sourceId);
  const targetDoc = documents.get(targetId);

  const handleExecuteTransfer = () => {
    if (!sourceId || !targetId) {
      toast.error("Please select both a source and target document.");
      return;
    }
    if (sourceId === targetId) {
      toast.error("Source and target document cannot be the same.");
      return;
    }
    if (!sourceDoc || !targetDoc) return;

    let pagesToTransfer: number[] = [];
    if (pageSelection === "current") {
      pagesToTransfer = [sourceDoc.currentPage];
    } else if (pageSelection === "selected") {
      pagesToTransfer = sourceDoc.selectedPages.length > 0 ? sourceDoc.selectedPages : [sourceDoc.currentPage];
    } else if (pageSelection === "all") {
      pagesToTransfer = sourceDoc.pageOrder.map((_, i) => i);
    }

    if (pagesToTransfer.length === 0) {
      toast.error("No pages selected to transfer.");
      return;
    }

    const insertIndex = insertPos === "start" ? 0 : targetDoc.pageOrder.length;
    const isMove = transferMode === "move";

    copyPagesBetweenDocs(sourceId, pagesToTransfer, targetId, insertIndex, isMove);

    const actionText = isMove ? "Moved" : "Copied";
    toast.success(
      `${actionText} ${pagesToTransfer.length} page(s) to "${targetDoc.fileName || "Target Document"}"`,
    );

    if (onClose) onClose();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 shadow-xl text-slate-200 w-80 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-white">
          <ArrowRightLeft className="w-4 h-4 text-blue-400" />
          Transfer Pages Between Tabs
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Source Document Selection */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-400">Source Document</label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          {tabOrder.map((id) => {
            const doc = documents.get(id);
            if (!doc) return null;
            return (
              <option key={id} value={id}>
                {doc.fileName || "Untitled"} ({doc.numPages} pages)
              </option>
            );
          })}
        </select>
      </div>

      {/* Target Document Selection */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-400">Target Document</label>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="" disabled>
            Select Target Tab...
          </option>
          {tabOrder
            .filter((id) => id !== sourceId)
            .map((id) => {
              const doc = documents.get(id);
              if (!doc) return null;
              return (
                <option key={id} value={id}>
                  {doc.fileName || "Untitled"} ({doc.numPages} pages)
                </option>
              );
            })}
        </select>
      </div>

      {/* Page Selection Options */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-400">Pages to Transfer</label>
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded border border-slate-800">
          <button
            onClick={() => setPageSelection("current")}
            className={`py-1 text-[11px] rounded font-medium transition-colors ${
              pageSelection === "current"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Current ({(sourceDoc?.currentPage ?? 0) + 1})
          </button>
          <button
            onClick={() => setPageSelection("selected")}
            className={`py-1 text-[11px] rounded font-medium transition-colors ${
              pageSelection === "selected"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Selected ({sourceDoc?.selectedPages.length || 0})
          </button>
          <button
            onClick={() => setPageSelection("all")}
            className={`py-1 text-[11px] rounded font-medium transition-colors ${
              pageSelection === "all"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All ({sourceDoc?.numPages || 0})
          </button>
        </div>
      </div>

      {/* Action Type: Copy vs Move */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Action</label>
          <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setTransferMode("copy")}
              className={`flex-1 py-1 text-[11px] rounded font-medium flex items-center justify-center gap-1 ${
                transferMode === "copy" ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
            <button
              onClick={() => setTransferMode("move")}
              className={`flex-1 py-1 text-[11px] rounded font-medium flex items-center justify-center gap-1 ${
                transferMode === "move" ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              <Layers className="w-3 h-3" /> Move
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-400">Position</label>
          <div className="flex bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setInsertPos("end")}
              className={`flex-1 py-1 text-[11px] rounded font-medium ${
                insertPos === "end" ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              At End
            </button>
            <button
              onClick={() => setInsertPos("start")}
              className={`flex-1 py-1 text-[11px] rounded font-medium ${
                insertPos === "start" ? "bg-slate-800 text-white" : "text-slate-400"
              }`}
            >
              At Start
            </button>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleExecuteTransfer}
        disabled={!targetId || sourceId === targetId}
        className="w-full flex items-center justify-center gap-2 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-sm"
      >
        <FileCheck className="w-4 h-4" />
        {transferMode === "move" ? "Move Pages" : "Copy Pages"}
      </button>
    </div>
  );
}

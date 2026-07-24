import React, { useState, useEffect, useRef } from "react";
import { Plus, X, FileText, AlertTriangle } from "lucide-react";
import { useDocumentStore } from "@/store/documentStore";

interface TabBarProps {
  onOpenPicker?: () => void;
}

export function TabBar({ onOpenPicker }: TabBarProps) {
  const documents = useDocumentStore((s) => s.documents);
  const tabOrder = useDocumentStore((s) => s.tabOrder);
  const activeDocId = useDocumentStore((s) => s.activeDocId);

  const openDocument = useDocumentStore((s) => s.openDocument);
  const closeDocument = useDocumentStore((s) => s.closeDocument);
  const switchToDocument = useDocumentStore((s) => s.switchToDocument);
  const renameDocument = useDocumentStore((s) => s.renameDocument);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Keyboard shortcuts (Ctrl+Tab, Ctrl+W, Ctrl+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab / Ctrl+Shift+Tab
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        if (tabOrder.length <= 1) return;
        const currentIndex = activeDocId ? tabOrder.indexOf(activeDocId) : 0;
        let nextIndex: number;
        if (e.shiftKey) {
          nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
        } else {
          nextIndex = (currentIndex + 1) % tabOrder.length;
        }
        switchToDocument(tabOrder[nextIndex]);
      }

      // Ctrl+W / Cmd+W (Close current tab)
      if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        if (!activeDocId) return;
        const activeDoc = documents.get(activeDocId);
        if (activeDoc?.dirty) {
          setConfirmCloseId(activeDocId);
        } else {
          closeDocument(activeDocId);
        }
      }

      // Ctrl+N / Cmd+N (New tab)
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        if (onOpenPicker) {
          onOpenPicker();
        } else {
          openDocument();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDocId, tabOrder, documents, switchToDocument, closeDocument, openDocument, onOpenPicker]);

  const handleStartRename = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name || "Untitled.pdf");
  };

  const handleCommitRename = (id: string) => {
    if (editingName.trim()) {
      renameDocument(id, editingName.trim());
    }
    setEditingId(null);
  };

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const doc = documents.get(id);
    if (doc?.dirty) {
      setConfirmCloseId(id);
    } else {
      closeDocument(id);
    }
  };

  const handleConfirmClose = () => {
    if (confirmCloseId) {
      closeDocument(confirmCloseId);
      setConfirmCloseId(null);
    }
  };

  return (
    <div className="relative z-[150] flex items-center bg-card border-b border-border text-foreground select-none overflow-x-auto no-scrollbar h-10 px-2 gap-1">
      {/* Tabs */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {tabOrder.map((id) => {
          const doc = documents.get(id);
          if (!doc) return null;

          const isActive = id === activeDocId;
          const displayName = doc.fileName || "Untitled Document";

          return (
            <div
              key={id}
              onClick={() => switchToDocument(id)}
              onDoubleClick={() => handleStartRename(id, displayName)}
              className={`group relative flex items-center gap-2 h-8 px-3 rounded-t-md text-xs font-medium cursor-pointer transition-colors max-w-[200px] min-w-[120px] shrink flex-1 border-x ${
                isActive
                  ? "bg-background text-foreground border-t-2 border-t-primary border-x-border font-semibold shadow-xs"
                  : "bg-muted/40 text-muted-foreground border-t border-t-transparent border-x-transparent hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <FileText className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />

              {editingId === id ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => handleCommitRename(id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename(id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full bg-background text-foreground px-1 py-0.5 rounded outline-none border border-primary text-xs"
                />
              ) : (
                <span className="truncate flex-1" title={displayName}>
                  {displayName}
                </span>
              )}

              {/* Dirty indicator */}
              {doc.dirty && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                  title="Unsaved changes"
                />
              )}

              {/* Close Button */}
              <button
                onClick={(e) => handleCloseClick(e, id)}
                className={`p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
                title="Close tab (Ctrl+W)"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {/* Plus / Add Tab Button */}
        <button
          onClick={() => {
            if (onOpenPicker) {
              onOpenPicker();
            } else {
              openDocument();
            }
          }}
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Open document in new tab (Ctrl+N)"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Unsaved Changes Confirmation Modal / Dialog */}
      {confirmCloseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-card border border-border rounded-lg p-5 max-w-sm w-full shadow-xl text-card-foreground space-y-4">
            <div className="flex items-center gap-3 text-amber-500 font-semibold text-sm">
              <AlertTriangle className="w-5 h-5" />
              Unsaved Changes
            </div>
            <p className="text-xs text-muted-foreground">
              Document &quot;
              <span className="font-semibold text-foreground">
                {documents.get(confirmCloseId)?.fileName || "Untitled"}
              </span>
              &quot; has unsaved changes. Are you sure you want to close it?
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setConfirmCloseId(null)}
                className="px-3 py-1.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-3 py-1.5 rounded bg-destructive hover:bg-destructive/90 text-destructive-foreground font-medium transition-colors"
              >
                Discard &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

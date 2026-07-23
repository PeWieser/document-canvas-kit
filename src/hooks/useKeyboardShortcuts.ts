import { useEffect } from "react";
import { useDocumentStore } from "@/store/documentStore";
import type { Tool } from "@/lib/pdf/types";

interface UseKeyboardShortcutsOptions {
  onSave?: () => void;
  onExport?: () => void;
  onOpenShortcuts?: () => void;
  onCloseShortcuts?: () => void;
  isShortcutsOpen?: boolean;
}

function isInputElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { onSave, onExport, onOpenShortcuts, onCloseShortcuts, isShortcutsOpen } = options;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();
      const inInput = isInputElement(e.target);

      // 1. Shortcuts that run regardless of input focus (e.g. Escape, Command Palette)
      if (key === "escape") {
        if (isShortcutsOpen && onCloseShortcuts) {
          e.preventDefault();
          onCloseShortcuts();
          return;
        }
        const activeDoc = useDocumentStore.getState().getActive();
        if (activeDoc) {
          if (activeDoc.gridOpen) {
            activeDoc.setGridOpen(false);
          }
          if (activeDoc.selectedId) {
            activeDoc.select(null);
          }
        }
        return;
      }

      // Ctrl + Shift + K -> Open Shortcuts Command Palette
      if (isCmdOrCtrl && isShift && key === "k") {
        e.preventDefault();
        if (onOpenShortcuts) {
          onOpenShortcuts();
        }
        return;
      }

      // 2. Ctrl/Cmd key combos
      if (isCmdOrCtrl) {
        // Ctrl + Z / Ctrl + Shift + Z / Ctrl + Y (Undo / Redo)
        if (key === "z") {
          e.preventDefault();
          const activeDoc = useDocumentStore.getState().getActive();
          if (activeDoc) {
            if (isShift) {
              activeDoc.redo();
            } else {
              activeDoc.undo();
            }
          }
          return;
        }

        if (key === "y") {
          e.preventDefault();
          const activeDoc = useDocumentStore.getState().getActive();
          if (activeDoc) {
            activeDoc.redo();
          }
          return;
        }

        // Ctrl + S -> Save
        if (key === "s") {
          e.preventDefault();
          if (onSave) onSave();
          return;
        }

        // Ctrl + P -> Print / Export
        if (key === "p" && !inInput) {
          e.preventDefault();
          if (onExport) onExport();
          return;
        }

        // Ctrl + W -> Close Tab
        if (key === "w") {
          e.preventDefault();
          const docStore = useDocumentStore.getState();
          if (docStore.activeDocId) {
            docStore.closeDocument(docStore.activeDocId);
          }
          return;
        }

        // Ctrl + Tab -> Cycle to Next Tab
        if (e.key === "Tab") {
          e.preventDefault();
          const docStore = useDocumentStore.getState();
          const tabs = docStore.tabOrder;
          if (tabs.length > 1 && docStore.activeDocId) {
            const currentIndex = tabs.indexOf(docStore.activeDocId);
            const nextIndex = isShift
              ? (currentIndex - 1 + tabs.length) % tabs.length
              : (currentIndex + 1) % tabs.length;
            docStore.switchToDocument(tabs[nextIndex]);
          }
          return;
        }

        // Ctrl + D -> Duplicate Selected Annotation
        if (key === "d" && !inInput) {
          e.preventDefault();
          const activeDoc = useDocumentStore.getState().getActive();
          if (activeDoc && activeDoc.selectedId) {
            const targetAnno = activeDoc.annotations.find((a) => a.id === activeDoc.selectedId);
            if (targetAnno) {
              const newId = `anno-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
              let duplicated: any = { ...targetAnno, id: newId };
              if ("x" in duplicated) duplicated.x += 15;
              if ("y" in duplicated) duplicated.y += 15;
              if ("rect" in duplicated) {
                duplicated.rect = { ...duplicated.rect, x: duplicated.rect.x + 15, y: duplicated.rect.y - 15 };
              }
              activeDoc.addAnnotation(duplicated);
            }
          }
          return;
        }

        // Ctrl + / Ctrl - -> Zoom
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          const activeDoc = useDocumentStore.getState().getActive();
          if (activeDoc) {
            activeDoc.setZoom(activeDoc.zoom + 0.15);
          }
          return;
        }

        if (e.key === "-") {
          e.preventDefault();
          const activeDoc = useDocumentStore.getState().getActive();
          if (activeDoc) {
            activeDoc.setZoom(activeDoc.zoom - 0.15);
          }
          return;
        }
      }

      // If user is currently typing in an input/textarea, do NOT trigger single key shortcuts below
      if (inInput) return;

      // 3. Single-Key Tool Shortcuts
      const activeDoc = useDocumentStore.getState().getActive();
      if (!activeDoc) return;

      const toolMap: Record<string, Tool> = {
        v: "select",
        h: "highlight",
        r: "redact",
        t: "edit-text",
        x: "textbox",
        i: "textbox",
        p: "pen",
        c: "comment",
      };

      const matchedTool = toolMap[key];
      if (matchedTool) {
        activeDoc.setTool(matchedTool);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (activeDoc.selectedId) {
          e.preventDefault();
          activeDoc.removeAnnotation(activeDoc.selectedId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, onExport, onOpenShortcuts, onCloseShortcuts, isShortcutsOpen]);
}

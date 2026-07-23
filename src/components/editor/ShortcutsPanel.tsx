import { useState, useMemo } from "react";
import { Search, X, Keyboard, Command } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShortcutItem {
  keys: string[];
  description: string;
  category: "General" | "Tools" | "Editing" | "Navigation";
}

const SHORTCUTS_LIST: ShortcutItem[] = [
  // General
  { keys: ["Ctrl", "S"], description: "Save Document", category: "General" },
  { keys: ["Ctrl", "P"], description: "Export / Print PDF", category: "General" },
  { keys: ["Ctrl", "W"], description: "Close Active Document", category: "General" },
  { keys: ["Ctrl", "Shift", "K"], description: "Toggle Keyboard Shortcuts", category: "General" },
  
  // Tools
  { keys: ["V"], description: "Select Tool", category: "Tools" },
  { keys: ["H"], description: "Hand / Pan Tool", category: "Tools" },
  { keys: ["R"], description: "Redact Tool", category: "Tools" },
  { keys: ["T"], description: "Text Box Tool", category: "Tools" },
  { keys: ["P"], description: "Comment Pin Tool", category: "Tools" },
  { keys: ["I"], description: "Image Tool", category: "Tools" },

  // Editing
  { keys: ["Ctrl", "Z"], description: "Undo Action", category: "Editing" },
  { keys: ["Ctrl", "Shift", "Z"], description: "Redo Action", category: "Editing" },
  { keys: ["Ctrl", "Y"], description: "Redo Action", category: "Editing" },
  { keys: ["Ctrl", "D"], description: "Duplicate Selected Annotation", category: "Editing" },
  { keys: ["Delete"], description: "Delete Selected Annotation", category: "Editing" },
  { keys: ["Escape"], description: "Clear Selection / Close Overlay", category: "Editing" },

  // Navigation
  { keys: ["Ctrl", "Tab"], description: "Switch to Next Tab", category: "Navigation" },
  { keys: ["Ctrl", "Shift", "Tab"], description: "Switch to Previous Tab", category: "Navigation" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsPanel({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState("");

  const filteredShortcuts = useMemo(() => {
    if (!query.trim()) return SHORTCUTS_LIST;
    const q = query.toLowerCase();
    return SHORTCUTS_LIST.filter(
      (item) =>
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keys.some((k) => k.toLowerCase().includes(q))
    );
  }, [query]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(filteredShortcuts.map((s) => s.category)));
    return cats;
  }, [filteredShortcuts]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-card/95 text-card-foreground shadow-2xl backdrop-blur-md animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
          <Search className="w-5 h-5 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keyboard shortcuts (e.g. Save, Redact, Ctrl+Z)..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground text-foreground"
            autoFocus
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-6">
          {categories.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No keyboard shortcuts found matching &quot;{query}&quot;.
            </div>
          ) : (
            categories.map((cat) => {
              const items = filteredShortcuts.filter((s) => s.category === cat);
              return (
                <div key={cat} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">
                    {cat}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-border/50 bg-background/50 hover:bg-accent/40 transition-colors"
                      >
                        <span className="text-xs font-medium text-foreground">
                          {item.description}
                        </span>
                        <div className="flex items-center gap-1">
                          {item.keys.map((k, i) => (
                            <kbd
                              key={i}
                              className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-md border border-border bg-muted/80 text-muted-foreground shadow-xs"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-4 h-4" />
            <span>PDF Studio Shortcuts</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-border bg-muted">
              Esc
            </kbd>
            <span>to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

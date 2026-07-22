import { useMemo } from "react";
import { Bold, Italic } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { COMMON_FONTS, loadWebFont } from "@/lib/pdf/fontDetect";
import { cn } from "@/lib/utils";
import fontFamilies from "@/lib/pdf/font-families.json";

const TEXT_COLORS = ["#111111", "#e5484d", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

/**
 * Compact inline font controls (Word / Pages / Notion style).
 *
 * Shown in the Toolbar when:
 *   - tool is "textbox" or "edit-text" (for new annotations), OR
 *   - tool is "select" and a text annotation is currently selected.
 *
 * All edits are written directly to the store via updateAnnotation.
 */
export function FontPicker() {
  const { t } = useI18n();
  const selectedId = useEditor((s) => s.selectedId);
  const annotations = useEditor((s) => s.annotations);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const fingerprints = useEditor((s) => s.fingerprints);

  const anno = annotations.find((a) => a.id === selectedId);

  const defaultFontFamily = useEditor((s) => s.defaultFontFamily);
  const defaultFontSize = useEditor((s) => s.fontSize);
  const defaultColor = useEditor((s) => s.color);

  // Font family dropdown: combine COMMON_FONTS, custom fingerprints, and all 1900+ Bunny Fonts
  const families = useMemo(() => {
    const list = new Set([...COMMON_FONTS, ...fontFamilies]);
    for (const fp of fingerprints) {
      if (fp.family) {
        list.add(fp.family);
      }
    }
    const sorted = Array.from(list).sort();
    if (anno && anno.fontFamily && !sorted.includes(anno.fontFamily)) {
      return [anno.fontFamily, ...sorted];
    }
    return sorted;
  }, [fingerprints, anno?.fontFamily]);

  // Only render for text-carrying annotations if one is selected, but allow rendering for new text tools
  if (anno && anno.kind !== "textReplace" && anno.kind !== "textbox") return null;

  const patch = (p: Record<string, unknown>) => {
    if (anno) {
      updateAnnotation(anno.id, p as never);
    }
  };

  const currentFontFamily = anno?.fontFamily || defaultFontFamily || "Helvetica";
  const currentFontSize = anno ? Math.round(anno.fontSize) : defaultFontSize || 16;
  const currentBold = anno?.bold || false;
  const currentItalic = anno?.italic || false;
  const currentColor = anno?.color || defaultColor || TEXT_COLORS[0];

  return (
    <div className="flex items-center gap-1 rounded-md bg-toolbar-accent/50 px-1.5 py-1">
      {/* Font family */}
      <select
        value={currentFontFamily}
        onChange={(e) => {
          void loadWebFont(e.target.value);
          patch({ fontFamily: e.target.value });
        }}
        className="max-w-[8rem] rounded bg-toolbar-accent px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        title={t("font")}
      >
        {families.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>

      {/* Font size */}
      <input
        type="number"
        min={6}
        max={96}
        value={currentFontSize}
        onChange={(e) => patch({ fontSize: Math.max(6, Math.min(96, Number(e.target.value))) })}
        className="w-12 rounded bg-toolbar-accent px-1 py-1 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
        title={t("fontSize")}
      />

      {/* Bold */}
      <button
        onClick={() => patch({ bold: !currentBold })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          currentBold ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
        )}
        title={t("bold")}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* Italic */}
      <button
        onClick={() => patch({ italic: !currentItalic })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          currentItalic ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
        )}
        title={t("italic")}
      >
        <Italic className="h-3.5 w-3.5" />
      </button>

      {/* Color swatches */}
      <div className="flex items-center gap-1 pl-1">
        {TEXT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => patch({ color: c })}
            className={cn(
              "h-4 w-4 rounded-full ring-offset-1 ring-offset-toolbar transition",
              currentColor === c ? "ring-2 ring-primary" : "ring-1 ring-white/30",
            )}
            style={{ background: c }}
            title={t("color")}
          />
        ))}
      </div>

      {/* Line Height (Zeilenabstand) */}
      <div className="flex items-center gap-1 border-l border-toolbar-accent/50 pl-1.5">
        <span className="text-[10px] text-muted-foreground font-mono">↕</span>
        <select
          value={anno?.lineHeight ? Number(anno.lineHeight.toFixed(2)) : 1.2}
          onChange={(e) => patch({ lineHeight: Number(e.target.value) })}
          className="rounded bg-toolbar-accent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary font-mono"
          title={t("lineHeight") || "Zeilenabstand"}
        >
          <option value={1.0}>1.0</option>
          <option value={1.15}>1.15</option>
          <option value={1.2}>1.2</option>
          <option value={1.3}>1.3</option>
          <option value={1.4}>1.4</option>
          <option value={1.5}>1.5</option>
          <option value={1.8}>1.8</option>
          <option value={2.0}>2.0</option>
        </select>
      </div>
    </div>
  );
}

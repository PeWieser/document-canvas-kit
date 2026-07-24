import { useMemo } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
} from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { COMMON_FONTS, loadWebFont } from "@/lib/pdf/fontDetect";
import { cn } from "@/lib/utils";
import fontFamilies from "@/lib/pdf/font-families.json";
import { ColorPickerWithEyedropper } from "./ColorPickerWithEyedropper";

const TEXT_COLORS = ["#111111", "#e5484d", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];

/**
 * Compact inline font & paragraph controls toolbar (Word / InDesign / Notion style).
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

  // Font family dropdown
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

  if (anno && anno.kind !== "textReplace" && anno.kind !== "textbox") return null;

  const patch = (p: Record<string, unknown>) => {
    if (anno) {
      updateAnnotation(anno.id, p as never);
    }
  };

  const currentFontFamily = anno?.fontFamily || defaultFontFamily || "Helvetica";
  const currentFontSize = anno ? Math.round(anno.fontSize) : defaultFontSize || 16;
  const currentBold = (anno as any)?.bold || false;
  const currentItalic = (anno as any)?.italic || false;
  const currentUnderline = (anno as any)?.underline || false;
  const currentStrikethrough = (anno as any)?.strikethrough || false;
  const currentColor = (anno as any)?.color || defaultColor || TEXT_COLORS[0];
  const currentAlignment = (anno as any)?.alignment || "left";
  const currentParagraphSpacing = (anno as any)?.paragraphSpacing || 0;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-toolbar-accent/50 px-2 py-1">
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
        onChange={(e) => {
          const newFontSize = Math.max(6, Math.min(96, Number(e.target.value)));
          const patchData: Record<string, unknown> = { fontSize: newFontSize };
          if (anno) {
            const currentTransform = (anno as any).transform;
            if (currentTransform && Array.isArray(currentTransform)) {
              const newTransform = [...currentTransform];
              newTransform[0] = newFontSize;
              newTransform[3] = newFontSize;
              patchData.transform = newTransform;
            }
          }
          patch(patchData);
        }}
        className="w-12 rounded bg-toolbar-accent px-1 py-1 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
        title={t("fontSize")}
      />

      {/* Formatting Toggles: Bold, Italic, Underline, Strikethrough */}
      <div className="flex items-center gap-0.5 border-l border-toolbar-accent/50 pl-1.5">
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

        <button
          onClick={() => patch({ underline: !currentUnderline })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentUnderline ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Underline"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => patch({ strikethrough: !currentStrikethrough })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentStrikethrough ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Alignment Controls */}
      <div className="flex items-center gap-0.5 border-l border-toolbar-accent/50 pl-1.5">
        <button
          onClick={() => patch({ alignment: "left" })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentAlignment === "left" ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Left Align"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => patch({ alignment: "center" })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentAlignment === "center" ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Center Align"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => patch({ alignment: "right" })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentAlignment === "right" ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Right Align"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => patch({ alignment: "justify" })}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded transition-colors",
            currentAlignment === "justify" ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
          title="Justify Align"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Text Color Picker */}
      <div className="flex items-center gap-1 border-l border-toolbar-accent/50 pl-1.5">
        <ColorPickerWithEyedropper
          value={currentColor}
          onChange={(c) => patch({ color: c })}
          swatches={TEXT_COLORS}
          title={t("color")}
        />
      </div>

      {/* Line Height Selector (1.0 - 2.0) */}
      <div className="flex items-center gap-1 border-l border-toolbar-accent/50 pl-1.5">
        <span className="text-[10px] text-muted-foreground font-mono" title="Zeilenabstand">↕</span>
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

      {/* Paragraph Spacing */}
      <div className="flex items-center gap-1 border-l border-toolbar-accent/50 pl-1.5">
        <span className="text-[10px] text-muted-foreground font-mono" title="Absatzabstand">¶</span>
        <input
          type="number"
          min={0}
          max={48}
          value={currentParagraphSpacing}
          onChange={(e) => patch({ paragraphSpacing: Math.max(0, Math.min(48, Number(e.target.value))) })}
          className="w-10 rounded bg-toolbar-accent px-1 py-1 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
          title="Absatzabstand (pt)"
        />
      </div>
    </div>
  );
}

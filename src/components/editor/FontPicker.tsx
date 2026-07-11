import { Bold, Italic } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import { COMMON_FONTS, loadWebFont } from "@/lib/pdf/fontDetect";
import { cn } from "@/lib/utils";

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

  const anno = annotations.find((a) => a.id === selectedId);

  // Only render for text-carrying annotations.
  if (!anno || (anno.kind !== "textReplace" && anno.kind !== "textbox")) return null;

  // Font family dropdown: detected font first, then common list.
  const families =
    anno.fontFamily && !COMMON_FONTS.includes(anno.fontFamily)
      ? [anno.fontFamily, ...COMMON_FONTS]
      : COMMON_FONTS;

  const patch = (p: Record<string, unknown>) => updateAnnotation(anno.id, p as never);

  return (
    <div className="flex items-center gap-1 rounded-md bg-toolbar-accent/50 px-1.5 py-1">
      {/* Font family */}
      <select
        value={anno.fontFamily || "Helvetica"}
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
        value={Math.round(anno.fontSize)}
        onChange={(e) => patch({ fontSize: Math.max(6, Math.min(96, Number(e.target.value))) })}
        className="w-12 rounded bg-toolbar-accent px-1 py-1 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-primary"
        title={t("fontSize")}
      />

      {/* Bold */}
      <button
        onClick={() => patch({ bold: !anno.bold })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          anno.bold ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
        )}
        title={t("bold")}
      >
        <Bold className="h-3.5 w-3.5" />
      </button>

      {/* Italic */}
      <button
        onClick={() => patch({ italic: !anno.italic })}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded transition-colors",
          anno.italic ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
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
              anno.color === c ? "ring-2 ring-primary" : "ring-1 ring-white/30",
            )}
            style={{ background: c }}
            title={t("color")}
          />
        ))}
      </div>
    </div>
  );
}

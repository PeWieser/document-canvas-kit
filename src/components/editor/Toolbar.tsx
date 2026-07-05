import {
  MousePointer2,
  Highlighter,
  Square,
  Type,
  TextCursorInput,
  Pen,
  MessageSquarePlus,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Download,
  LayoutGrid,
  Loader2,
  Moon,
  Sun,
  FileUp,
} from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Tool } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";

const HL_COLORS = ["#ffd54a", "#7ee787", "#7cc4ff", "#ff9ecb"];
const PEN_COLORS = ["#111111", "#e5484d", "#2563eb", "#16a34a", "#f59e0b"];

interface Props {
  onExport: () => void;
  onOpen: () => void;
  exporting: boolean;
  dark: boolean;
  onToggleTheme: () => void;
}

export function Toolbar({ onExport, onOpen, exporting, dark, onToggleTheme }: Props) {
  const { t, lang, setLang } = useI18n();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const setGridOpen = useEditor((s) => s.setGridOpen);
  const color = useEditor((s) => s.color);
  const setColor = useEditor((s) => s.setColor);
  const highlightColor = useEditor((s) => s.highlightColor);
  const setHighlightColor = useEditor((s) => s.setHighlightColor);
  const fontSize = useEditor((s) => s.fontSize);
  const setFontSize = useEditor((s) => s.setFontSize);
  const penSize = useEditor((s) => s.penSize);
  const setPenSize = useEditor((s) => s.setPenSize);

  const tools: { id: Tool; icon: typeof MousePointer2; label: string }[] = [
    { id: "select", icon: MousePointer2, label: t("select") },
    { id: "highlight", icon: Highlighter, label: t("highlight") },
    { id: "redact", icon: Square, label: t("redact") },
    { id: "edit-text", icon: TextCursorInput, label: t("editText") },
    { id: "textbox", icon: Type, label: t("textbox") },
    { id: "pen", icon: Pen, label: t("pen") },
    { id: "comment", icon: MessageSquarePlus, label: t("comment") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-toolbar-accent/40 bg-toolbar px-2 py-1.5 text-toolbar-foreground">
      <div className="mr-1 flex items-center gap-2 pr-2">
        <span className="font-semibold tracking-tight">{t("appName")}</span>
      </div>

      <button
        onClick={onOpen}
        className="flex items-center gap-1.5 rounded-md bg-toolbar-accent px-2.5 py-1.5 text-sm hover:bg-toolbar-accent/70"
      >
        <FileUp className="h-4 w-4" />
        <span className="hidden sm:inline">{t("openFile")}</span>
      </button>

      <Divider />

      <div className="flex items-center gap-0.5">
        {tools.map((tl) => (
          <TBtn key={tl.id} active={tool === tl.id} title={tl.label} onClick={() => setTool(tl.id)}>
            <tl.icon className="h-4 w-4" />
          </TBtn>
        ))}
      </div>

      {/* contextual settings */}
      {tool === "highlight" && (
        <>
          <Divider />
          <SwatchRow colors={HL_COLORS} value={highlightColor} onChange={setHighlightColor} />
        </>
      )}
      {(tool === "pen" || tool === "textbox" || tool === "edit-text") && (
        <>
          <Divider />
          <SwatchRow colors={PEN_COLORS} value={color} onChange={setColor} />
        </>
      )}
      {tool === "pen" && (
        <input
          type="range"
          min={1}
          max={16}
          value={penSize}
          onChange={(e) => setPenSize(Number(e.target.value))}
          className="w-20 accent-primary"
          title={t("penSize")}
        />
      )}
      {(tool === "textbox" || tool === "edit-text") && (
        <input
          type="number"
          min={6}
          max={96}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="w-14 rounded bg-toolbar-accent px-1.5 py-1 font-mono text-xs"
          title={t("fontSize")}
        />
      )}

      <Divider />
      <TBtn title={t("undo")} onClick={undo} disabled={past === 0}>
        <Undo2 className="h-4 w-4" />
      </TBtn>
      <TBtn title={t("redo")} onClick={redo} disabled={future === 0}>
        <Redo2 className="h-4 w-4" />
      </TBtn>

      <Divider />
      <TBtn title={t("zoomOut")} onClick={() => setZoom(zoom - 0.15)}>
        <ZoomOut className="h-4 w-4" />
      </TBtn>
      <span className="w-12 text-center font-mono text-xs">{Math.round(zoom * 100)}%</span>
      <TBtn title={t("zoomIn")} onClick={() => setZoom(zoom + 0.15)}>
        <ZoomIn className="h-4 w-4" />
      </TBtn>
      <TBtn title={t("gridView")} onClick={() => setGridOpen(true)}>
        <LayoutGrid className="h-4 w-4" />
      </TBtn>

      <div className="ml-auto flex items-center gap-1">
        <TBtn title={t("theme")} onClick={onToggleTheme}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </TBtn>
        <button
          onClick={() => setLang(lang === "de" ? "en" : "de")}
          className="rounded-md bg-toolbar-accent px-2 py-1.5 font-mono text-xs uppercase hover:bg-toolbar-accent/70"
          title={t("language")}
        >
          {lang}
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">{exporting ? t("exporting") : t("download")}</span>
        </button>
      </div>
    </div>
  );
}

function TBtn({
  children,
  active,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
        active ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-toolbar-accent/60" />;
}

function SwatchRow({
  colors,
  value,
  onChange,
}: {
  colors: string[];
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          className={cn(
            "h-5 w-5 rounded-full ring-offset-1 ring-offset-toolbar transition",
            value === c ? "ring-2 ring-white" : "ring-1 ring-white/30",
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

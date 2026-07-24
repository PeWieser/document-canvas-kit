import { useState } from "react";
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
  FileText,
  Wrench,
  ChevronLeft,
  ChevronRight,
  StretchHorizontal,
  StretchVertical,
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen,
  MessagesSquare,
  MoreVertical,
  Search,
  Palette,
  Crop,
  Keyboard,
  Magnet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { Tool } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";
import { FontPicker } from "./FontPicker";
import { ColorPickerWithEyedropper } from "./ColorPickerWithEyedropper";

const HL_COLORS = ["#ffd54a", "#7ee787", "#7cc4ff", "#ff9ecb"];
const PEN_COLORS = ["#111111", "#e5484d", "#2563eb", "#16a34a", "#f59e0b"];

interface Props {
  onOpen: () => void;
  onExport: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onQuit: () => void;
  onOpenShortcuts?: () => void;
  exporting: boolean;
  dark: boolean;
  onToggleTheme: () => void;
}

export function Toolbar({
  onOpen,
  onExport,
  onSave,
  onSaveAs,
  onQuit,
  onOpenShortcuts,
  exporting,
  dark,
  onToggleTheme,
}: Props) {
  const { t, lang, setLang } = useI18n();
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const past = useEditor((s) => s.past.length);
  const future = useEditor((s) => s.future.length);
  const setGridOpen = useEditor((s) => s.setGridOpen);
  const sidebarOpen = useEditor((s) => s.sidebarOpen);
  const toggleSidebar = useEditor((s) => s.toggleSidebar);
  const selectedId = useEditor((s) => s.selectedId);
  const commentsPanelOpen = useEditor((s) => s.commentsPanelOpen);
  const toggleCommentsPanel = useEditor((s) => s.toggleCommentsPanel);
  const color = useEditor((s) => s.color);
  const setColor = useEditor((s) => s.setColor);
  const highlightColor = useEditor((s) => s.highlightColor);
  const setHighlightColor = useEditor((s) => s.setHighlightColor);
  const fontSize = useEditor((s) => s.fontSize);
  const setFontSize = useEditor((s) => s.setFontSize);
  const penSize = useEditor((s) => s.penSize);
  const setPenSize = useEditor((s) => s.setPenSize);
  const penStyle = useEditor((s) => s.penStyle);
  const setPenStyle = useEditor((s) => s.setPenStyle);
  const toggleSearch = useEditor((s) => s.toggleSearch);
  const searchOpen = useEditor((s) => s.searchOpen);
  const snapToGuides = useEditor((s) => s.snapToGuides);
  const toggleSnapToGuides = useEditor((s) => s.toggleSnapToGuides);
  const currentPage = useEditor((s) => s.currentPage);
  const numPages = useEditor((s) => s.pageOrder.length);
  const annotations = useEditor((s) => s.annotations);

  const selectedAnno = annotations.find((a) => a.id === selectedId);
  const hasTextSelected =
    selectedAnno && (selectedAnno.kind === "textbox" || selectedAnno.kind === "textReplace");

  const tools: { id: Tool; icon: typeof MousePointer2; label: string; hint: string }[] = [
    { id: "select", icon: MousePointer2, label: t("select"), hint: t("toolSelectHint") },
    { id: "highlight", icon: Highlighter, label: t("highlight"), hint: t("toolHighlightHint") },
    { id: "redact", icon: Square, label: t("redact"), hint: t("toolRedactHint") },
    { id: "edit-text", icon: TextCursorInput, label: t("editText"), hint: t("toolEditHint") },
    { id: "textbox", icon: Type, label: t("textbox"), hint: t("toolTextboxHint") },
    { id: "pen", icon: Pen, label: t("pen"), hint: t("toolPenHint") },
    { id: "comment", icon: MessageSquarePlus, label: t("comment"), hint: t("toolCommentHint") },
    { id: "crop", icon: Crop, label: t("cropTool"), hint: t("toolCropHint") },
  ];
  const activeTool = tools.find((x) => x.id === tool);

  const showSubToolbar =
    tool === "highlight" ||
    tool === "pen" ||
    tool === "edit-text" ||
    tool === "textbox" ||
    tool === "comment" ||
    (tool === "select" && hasTextSelected);

  const jumpTo = (i: number) => {
    const clamped = Math.max(0, Math.min(numPages - 1, i));
    window.dispatchEvent(new CustomEvent("pdf-jump", { detail: clamped }));
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col border-b border-toolbar-accent/40 bg-toolbar/85 backdrop-blur-md sticky top-0 z-[100] transition-all duration-200 text-toolbar-foreground">
        {/* Main Toolbar Row */}
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-2 py-1.5">
          {/* LEFT: brand + menus */}
          <div className="flex min-w-0 items-center gap-1">
            <TBtn
              title={sidebarOpen ? t("collapseSidebar") : t("expandSidebar")}
              onClick={toggleSidebar}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </TBtn>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-toolbar-accent focus:outline-none transition-colors">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">{t("file")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={onOpen}>{t("openFile")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSave}>{t("saveOverwrite")} (Ctrl+S)</DropdownMenuItem>
                <DropdownMenuItem onClick={onSaveAs}>{t("saveAs")}</DropdownMenuItem>
                <DropdownMenuItem onClick={onExport}>{t("export")} (Ctrl+P)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onQuit}>{t("quit")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-toolbar-accent focus:outline-none transition-colors">
                <Wrench className="h-4 w-4" />
                <span className="hidden sm:inline">{t("tools")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                {tools.map((tl) => (
                  <DropdownMenuItem
                    key={tl.id}
                    onClick={() => setTool(tl.id)}
                    className={cn("flex items-start gap-2 transition-colors", tool === tl.id && "bg-accent")}
                  >
                    <tl.icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">{tl.label}</span>
                      <span className="text-xs text-muted-foreground">{tl.hint}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* active tool indicator */}
            {activeTool && (
              <div className="ml-1 hidden items-center gap-1.5 rounded-md bg-toolbar-accent/50 px-2 py-1 lg:flex animate-fade-in">
                <activeTool.icon className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{activeTool.label}</span>
              </div>
            )}
          </div>

          {/* CENTER: view + page navigation */}
          <div className="flex items-center justify-center gap-1 min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs hover:bg-toolbar-accent focus:outline-none border border-toolbar-accent/30 cursor-pointer transition-colors"
                  title={t("view") || "Ansicht"}
                >
                  {viewMode === "fit-width" && <StretchHorizontal className="h-3.5 w-3.5" />}
                  {viewMode === "fit-height" && <StretchVertical className="h-3.5 w-3.5" />}
                  {viewMode === "two-page" && <BookOpen className="h-3.5 w-3.5" />}
                  {viewMode === "custom" && <ZoomIn className="h-3.5 w-3.5" />}
                  <span className="hidden md:inline font-medium">
                    {viewMode === "fit-width" && t("fitWidth")}
                    {viewMode === "fit-height" && t("fitHeight")}
                    {viewMode === "two-page" && t("twoPage")}
                    {viewMode === "custom" && (t("customView") || "Zoom")}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuItem onClick={() => setViewMode("fit-width")} className={cn(viewMode === "fit-width" && "bg-accent")}>
                  <StretchHorizontal className="mr-2 h-4 w-4" />
                  <span>{t("fitWidth")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("fit-height")} className={cn(viewMode === "fit-height" && "bg-accent")}>
                  <StretchVertical className="mr-2 h-4 w-4" />
                  <span>{t("fitHeight")}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setViewMode("two-page")} className={cn(viewMode === "two-page" && "bg-accent")}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  <span>{t("twoPage")}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGridOpen(true)}>
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  <span>{t("gridView")}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Divider className="hidden sm:block" />

            <TBtn title={t("zoomOut")} onClick={() => setZoom(zoom - 0.15)}>
              <ZoomOut className="h-4 w-4" />
            </TBtn>
            <span className="w-10 text-center font-mono text-xs hidden sm:inline">{Math.round(zoom * 100)}%</span>
            <TBtn title={t("zoomIn")} onClick={() => setZoom(zoom + 0.15)}>
              <ZoomIn className="h-4 w-4" />
            </TBtn>

            <Divider className="hidden sm:block" />

            <TBtn
              title={t("prevPage")}
              onClick={() => jumpTo(currentPage - 1)}
              disabled={currentPage <= 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </TBtn>
            <PageInput
              current={currentPage}
              total={numPages}
              onGo={jumpTo}
              label={t("goToPage")}
              of={t("of")}
            />
            <TBtn
              title={t("nextPage")}
              onClick={() => jumpTo(currentPage + 1)}
              disabled={currentPage >= numPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </TBtn>
          </div>

          {/* RIGHT */}
          <div className="flex items-center gap-1">
            <TBtn title={`${t("undo")} (Ctrl+Z)`} onClick={undo} disabled={past === 0}>
              <Undo2 className="h-4 w-4" />
            </TBtn>
            <TBtn title={`${t("redo")} (Ctrl+Y)`} onClick={redo} disabled={future === 0}>
              <Redo2 className="h-4 w-4" />
            </TBtn>

            {/* Desktop Settings */}
            <div className="hidden sm:flex items-center gap-1">
              {onOpenShortcuts && (
                <TBtn title="Tastaturkürzel (Ctrl+Shift+K)" onClick={onOpenShortcuts}>
                  <Keyboard className="h-4 w-4" />
                </TBtn>
              )}
              <TBtn
                title={t("snapToGuides")}
                active={snapToGuides}
                onClick={toggleSnapToGuides}
              >
                <Magnet className="h-4 w-4" />
              </TBtn>
              <TBtn title={t("searchRedact")} active={searchOpen} onClick={toggleSearch}>
                <Search className="h-4 w-4" />
              </TBtn>
              <TBtn
                title={t("toggleComments")}
                active={commentsPanelOpen}
                onClick={toggleCommentsPanel}
              >
                <MessagesSquare className="h-4 w-4" />
              </TBtn>
              <TBtn title={t("theme")} onClick={onToggleTheme}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </TBtn>
              <button
                onClick={() => setLang(lang === "de" ? "en" : "de")}
                className="rounded-md bg-toolbar-accent px-2 py-1.5 font-mono text-xs uppercase hover:bg-toolbar-accent/70 cursor-pointer transition-colors"
                title={t("language")}
              >
                {lang}
              </button>
            </div>

            {/* Mobile / Compact Settings Dropdown */}
            <div className="sm:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-md p-1.5 hover:bg-toolbar-accent cursor-pointer" title={t("tools")}>
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={toggleSnapToGuides} className={cn(snapToGuides && "bg-accent")}>
                    <Magnet className="mr-2 h-4 w-4" />
                    <span>{t("snapToGuides")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleSearch} className={cn(searchOpen && "bg-accent")}>
                    <Search className="mr-2 h-4 w-4" />
                    <span>{t("searchRedact")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleCommentsPanel} className={cn(commentsPanelOpen && "bg-accent")}>
                    <MessagesSquare className="mr-2 h-4 w-4" />
                    <span>{t("comments")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onToggleTheme}>
                    {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    <span>{t("theme")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLang(lang === "de" ? "en" : "de")}>
                    <span className="mr-2 font-mono text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-bold">{lang}</span>
                    <span>{t("language")}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <button
              onClick={onExport}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">{exporting ? t("exporting") : t("download")}</span>
            </button>
          </div>
        </div>
        {/* Sub-Toolbar Row */}
        {showSubToolbar && (
          <div className="subtoolbar-scroll flex items-center justify-between border-t border-toolbar-accent/20 bg-toolbar-accent/5 px-4 py-1.5 text-xs animate-in slide-in-from-top-1 duration-150 overflow-x-auto min-w-0 max-w-full">
            <div className="flex items-center gap-4 min-w-max">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                {activeTool?.label || t("tools")} Settings:
              </span>

              {tool === "highlight" && (
                <ColorPickerWithEyedropper
                  value={highlightColor}
                  onChange={setHighlightColor}
                  swatches={HL_COLORS}
                  swatchSizeClassName="h-5 w-5"
                  title={t("highlight")}
                />
              )}

              {(tool === "pen" ||
                ((tool === "textbox" || tool === "edit-text") && !selectedId)) && (
                <div 
                  className={cn("flex items-center gap-1 transition-opacity duration-150", tool === "edit-text" && !selectedId ? "pointer-events-none" : "")}
                  style={{ opacity: tool === "edit-text" && !selectedId ? 0.35 : undefined }}
                >
                  <ColorPickerWithEyedropper
                    value={color}
                    onChange={setColor}
                    swatches={PEN_COLORS}
                    swatchSizeClassName="h-5 w-5"
                    title={t("pickColor")}
                  />
                </div>
              )}

              {tool === "pen" && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t("penSize")}:</span>
                    <input
                      type="range"
                      min={1}
                      max={16}
                      value={penSize}
                      onChange={(e) => setPenSize(Number(e.target.value))}
                      className="w-20 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      title={t("penSize")}
                    />
                    <span className="font-mono text-[10px]">{penSize}px</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">{t("penStyle")}:</span>
                    {(["solid", "marker", "pencil", "dashed"] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setPenStyle(s)}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase transition",
                          penStyle === s
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                        title={t(
                          s === "solid"
                            ? "penSolid"
                            : s === "marker"
                            ? "penMarker"
                            : s === "pencil"
                            ? "penPencil"
                            : "penDashed",
                        )}
                      >
                        {s === "solid"
                          ? t("penSolid")
                          : s === "marker"
                          ? t("penMarker")
                          : s === "pencil"
                          ? t("penPencil")
                          : t("penDashed")}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {(tool === "textbox" ||
                tool === "edit-text" ||
                (tool === "select" && hasTextSelected)) && (
                <div
                  className={cn(
                    "transition-opacity duration-150",
                    tool === "edit-text" && !selectedId ? "pointer-events-none" : "opacity-100",
                  )}
                  style={{ opacity: tool === "edit-text" && !selectedId ? 0.35 : undefined }}
                  title={tool === "edit-text" && !selectedId ? "Klicke auf einen Text zum Bearbeiten" : undefined}
                >
                  <FontPicker />
                </div>
              )}
            </div>

            {tool === "comment" && (
              <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                <span>{t("toolCommentHint")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function PageInput({
  current,
  total,
  onGo,
  label,
  of,
}: {
  current: number;
  total: number;
  onGo: (i: number) => void;
  label: string;
  of: string;
}) {
  const [val, setVal] = useState<string>("");
  const shown = val === "" ? String(current + 1) : val;
  return (
    <div className="flex items-center gap-1 font-mono text-xs" title={label}>
      <input
        value={shown}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => setVal("")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = parseInt(val || shown, 10);
            if (!isNaN(n)) onGo(n - 1);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-9 rounded bg-toolbar-accent px-1 py-1 text-center"
      />
      <span className="text-toolbar-foreground/70">
        {of} {total}
      </span>
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
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40",
            active ? "bg-primary text-primary-foreground" : "hover:bg-toolbar-accent",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

function Divider({ className }: { className?: string }) {
  return <div className={cn("mx-1 h-6 w-px bg-toolbar-accent/60", className)} />;
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

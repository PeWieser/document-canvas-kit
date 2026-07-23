import { useRef, useState, useEffect } from "react";
import { FileUp, FileText, Sparkles, Clock, ArrowRight, ShieldCheck, Highlighter, Eraser, PenLine } from "lucide-react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface RecentFile {
  name: string;
  size: number;
  lastOpened: number;
}

const RECENT_FILES_KEY = "pdfstudio_recent_files_v1";

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [creatingSample, setCreatingSample] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_FILES_KEY);
      if (stored) {
        setRecentFiles(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not read recent files", e);
    }
  }, []);

  const saveToRecent = (fileName: string, size: number) => {
    try {
      const existing: RecentFile[] = JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || "[]");
      const updated = [
        { name: fileName, size, lastOpened: Date.now() },
        ...existing.filter((f) => f.name !== fileName),
      ].slice(0, 5);
      localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
      setRecentFiles(updated);
    } catch (e) {
      console.warn("Could not save recent file", e);
    }
  };

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type === "application/pdf") {
      saveToRecent(f.name, f.size);
      onFile(f);
    }
  };

  const handleCreateSamplePdf = async () => {
    try {
      setCreatingSample(true);
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

      // Title header
      page.drawRectangle({
        x: 0,
        y: 720,
        width: 600,
        height: 80,
        color: rgb(0.95, 0.96, 0.98),
      });

      page.drawText("PDF Studio Sample Document", {
        x: 40,
        y: 750,
        size: 22,
        font,
        color: rgb(0, 0.48, 1),
      });

      page.drawText("Welcome to PDF Studio — Premium In-Browser Editor", {
        x: 40,
        y: 730,
        size: 11,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.45),
      });

      // Sample Content Section
      page.drawText("1. Feature Verification & Testing", {
        x: 40,
        y: 670,
        size: 14,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });

      page.drawText("This sample document lets you instantly test all editing capabilities:", {
        x: 40,
        y: 645,
        size: 11,
        font: fontRegular,
        color: rgb(0.25, 0.25, 0.25),
      });

      const bullets = [
        "• Redact (Schwärzen): Select text or drag a box to remove confidential details.",
        "• Edit Text: Click on any existing text block to edit and format inline.",
        "• Highlighting: Select text to apply persistent vector highlight overlays.",
        "• Comments & Pins: Add collaborative pins and threaded conversation replies.",
      ];

      bullets.forEach((b, idx) => {
        page.drawText(b, {
          x: 50,
          y: 615 - idx * 25,
          size: 10.5,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
      });

      // Confidential Box for Redaction Testing
      page.drawRectangle({
        x: 40,
        y: 450,
        width: 520,
        height: 50,
        color: rgb(0.99, 0.93, 0.93),
        borderColor: rgb(0.9, 0.3, 0.3),
        borderWidth: 1,
      });

      page.drawText("CONFIDENTIAL INFORMATION (Try Redacting This Line):", {
        x: 50,
        y: 480,
        size: 10,
        font,
        color: rgb(0.8, 0.1, 0.1),
      });

      page.drawText("Account Secret Key: SK-9982-XJ7-2026", {
        x: 50,
        y: 462,
        size: 10,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      });

      const pdfBytes = await pdfDoc.save();
      const file = new File([pdfBytes], "Sample_PDF_Studio_Demo.pdf", {
        type: "application/pdf",
      });

      saveToRecent(file.name, file.size);
      onFile(file);
    } catch (e) {
      console.error("Error creating sample PDF", e);
    } finally {
      setCreatingSample(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-desk p-6 animate-page-slide-in">
      <div className="w-full max-w-xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>PDF Studio 2.0</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            {t("appName")}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("tagline")}
          </p>
        </div>

        {/* Drag & Drop Main Card */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          className={cn(
            "group relative cursor-pointer rounded-2xl border-2 border-dashed border-border bg-card/80 p-8 sm:p-10 text-center transition-all duration-300 shadow-glass backdrop-blur-md",
            over
              ? "border-primary bg-primary/10 ring-4 ring-primary/20 scale-[1.01]"
              : "hover:border-primary/50 hover:bg-card hover:shadow-xl hover:scale-[1.005]",
          )}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 shadow-xs">
            <FileUp className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            <span className="hidden sm:inline">{t("dropHere")}</span>
            <span className="sm:hidden">{t("openFile")}</span>
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground max-w-xs mx-auto">
            {t("dropHint")}
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {/* Actions Grid: Sample PDF + Recent Files */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Sample PDF Action Card */}
          <button
            onClick={handleCreateSamplePdf}
            disabled={creatingSample}
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/70 hover:bg-card hover:border-primary/40 transition-all text-left shadow-xs hover:shadow-md group cursor-pointer disabled:opacity-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Demo PDF laden</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                Beispieldokument zum Testen erzeugen
              </p>
            </div>
          </button>

          {/* Quick Feature Badge Card */}
          <div className="flex items-center justify-around p-4 rounded-xl border border-border bg-card/70 backdrop-blur-xs text-xs font-medium text-muted-foreground">
            <div className="flex items-center gap-1.5" title={t("highlight")}>
              <Highlighter className="w-4 h-4 text-primary" />
              <span>Marker</span>
            </div>
            <div className="flex items-center gap-1.5" title={t("redact")}>
              <Eraser className="w-4 h-4 text-destructive" />
              <span>Schwärzen</span>
            </div>
            <div className="flex items-center gap-1.5" title={t("editText")}>
              <PenLine className="w-4 h-4 text-emerald-500" />
              <span>Text</span>
            </div>
          </div>
        </div>

        {/* Recent Files Section */}
        {recentFiles.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Zuletzt geöffnet
              </span>
              <span>{recentFiles.length} Datein</span>
            </div>
            <div className="space-y-1.5">
              {recentFiles.map((rf, idx) => (
                <div
                  key={idx}
                  onClick={() => inputRef.current?.click()}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-card/40 hover:bg-card hover:border-border transition-colors cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground truncate">{rf.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-2">
                    {(rf.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

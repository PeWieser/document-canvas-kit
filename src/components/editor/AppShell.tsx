import React, { useRef } from "react";
import { TabBar } from "./TabBar";
import { StatusBar } from "./StatusBar";
import { PdfStudio } from "./PdfStudio";
import { useDocumentStore } from "@/store/documentStore";
import { loadPdfDocument } from "@/lib/pdf/pdfjs";
import { clearGlobalFontCache } from "./PageView";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

export function AppShell() {
  const { t } = useI18n();
  const openDocument = useDocumentStore((s) => s.openDocument);
  const activeDocId = useDocumentStore((s) => s.activeDocId);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBytes = async (name: string, buf: Uint8Array, handle: FileSystemFileHandle | null) => {
    try {
      const probe = await loadPdfDocument(buf.buffer.slice(0) as ArrayBuffer);
      const p1 = await probe.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      clearGlobalFontCache();
      openDocument({
        fileName: name,
        bytes: buf,
        numPages: probe.numPages,
        estimateSize: { w: vp.width, h: vp.height },
        handle: handle,
      });
    } catch {
      toast.error(t("exportFail") || "Failed to load PDF file.");
    }
  };

  const handleOpenPicker = async () => {
    const w = window as any;
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker({
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const file = await handle.getFile();
        const buf = new Uint8Array(await file.arrayBuffer());
        await loadBytes(file.name, buf, handle);
        return;
      } catch {
        return; // user cancelled
      }
    }
    inputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const buf = new Uint8Array(await file.arrayBuffer());
      await loadBytes(file.name, buf, null);
      e.target.value = "";
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileInputChange}
      />
      <TabBar onOpenPicker={handleOpenPicker} />
      <div className="flex-1 flex flex-col min-h-0 relative">
        <PdfStudio key={activeDocId ?? "empty"} />
      </div>
      <StatusBar />
    </div>
  );
}

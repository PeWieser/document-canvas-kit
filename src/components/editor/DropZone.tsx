import { useRef, useState } from "react";
import { FileUp, ShieldCheck, Highlighter, Eraser, PenLine } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type === "application/pdf") onFile(f);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-desk p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">{t("appName")}</h1>
          <p className="mt-2.5 text-sm text-muted-foreground">{t("tagline")}</p>
        </div>

        {/* Drag/Drop Box */}
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
            "group relative cursor-pointer rounded-xl border border-border bg-card p-10 text-center transition-all duration-250 shadow-sm",
            over 
              ? "border-primary bg-primary/5 ring-1 ring-primary/30" 
              : "hover:border-primary/40 hover:shadow-md"
          )}
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <FileUp className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-medium text-foreground">{t("dropHere")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("dropHint")}</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        {/* Clean features grid */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Feature icon={Highlighter} label={t("highlight")} />
          <Feature icon={Eraser} label={t("redact")} />
          <Feature icon={PenLine} label={t("pen")} />
          <Feature icon={ShieldCheck} label={t("editText")} />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: typeof FileUp; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card p-4 text-center shadow-2xs hover:shadow-xs transition-shadow">
      <Icon className="h-5 w-5 text-muted-foreground/80" />
      <span className="mt-2 text-xs font-medium text-foreground">{label}</span>
    </div>
  );
}

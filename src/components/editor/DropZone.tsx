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
    <div className="flex min-h-full flex-1 items-center justify-center p-6">
      <div className="w-full max-w-xl text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t("appName")}</h1>
        <p className="mt-2 text-muted-foreground">{t("tagline")}</p>

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
            "mt-8 cursor-pointer rounded-2xl border-2 border-dashed bg-card p-12 transition",
            over ? "border-primary bg-accent/40" : "border-border hover:border-primary/60",
          )}
        >
          <FileUp className="mx-auto h-12 w-12 text-primary" />
          <p className="mt-4 font-medium">{t("dropHere")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("dropHint")}</p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <Feature icon={Highlighter} label={t("highlight")} />
          <Feature icon={Eraser} label={t("redact")} />
          <Feature icon={PenLine} label={t("pen")} />
          <Feature icon={ShieldCheck} label={t("dropHint")} />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: typeof FileUp; label: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-1.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

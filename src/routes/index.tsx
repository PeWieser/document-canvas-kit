import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  // pdf.js and the editor rely on browser APIs, so load them only on the client.
  const [Editor, setEditor] = useState<ComponentType | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;
    import("@/components/editor/PdfStudio")
      .then((m) => {
        if (mounted) setEditor(() => m.PdfStudio);
      })
      .catch((err) => {
        if (mounted) setError(err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    throw error;
  }

  return (
    <I18nProvider>
      <div className="min-h-screen bg-desk text-foreground">
        {Editor ? (
          <Editor />
        ) : (
          <div className="flex min-h-screen items-center justify-center text-muted-foreground">
            <span className="animate-pulse">PDF Studio…</span>
          </div>
        )}
      </div>
      <Toaster />
    </I18nProvider>
  );
}

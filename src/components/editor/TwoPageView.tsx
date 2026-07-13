import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PdfDocumentProxy } from "@/lib/pdf/pdfjs";
import { useEditor } from "@/store/editorStore";
import { PageView } from "./PageView";
import { cn } from "@/lib/utils";

export function TwoPageView({
  doc,
  onSelectClear,
}: {
  doc: PdfDocumentProxy;
  onSelectClear: () => void;
}) {
  const pageOrder = useEditor((s) => s.pageOrder);
  const currentPage = useEditor((s) => s.currentPage);
  const setCurrentPage = useEditor((s) => s.setCurrentPage);

  const leftIndex = currentPage - (currentPage % 2);
  const [flip, setFlip] = useState<"none" | "next" | "prev">("none");
  const prevLeft = useRef(leftIndex);

  useEffect(() => {
    if (leftIndex === prevLeft.current) return;
    setFlip(leftIndex > prevLeft.current ? "next" : "prev");
    prevLeft.current = leftIndex;
    const id = setTimeout(() => setFlip("none"), 450);
    return () => clearTimeout(id);
  }, [leftIndex]);

  const go = (dir: number) => {
    const next = Math.max(0, Math.min(pageOrder.length - 1, leftIndex + dir * 2));
    setCurrentPage(next - (next % 2));
  };

  const rightIndex = leftIndex + 1;
  const leftId = pageOrder[leftIndex];
  const rightId = rightIndex < pageOrder.length ? pageOrder[rightIndex] : null;

  return (
    <div
      className="relative flex min-h-full items-center justify-center p-8"
      onClick={onSelectClear}
    >
      <button
        onClick={() => go(-1)}
        disabled={leftIndex <= 0}
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-card p-2 shadow-md ring-1 ring-border transition hover:bg-accent disabled:opacity-30"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div
        className={cn(
          "flex items-start gap-1 [perspective:2000px]",
          flip === "next" && "animate-[flipNext_450ms_ease]",
          flip === "prev" && "animate-[flipPrev_450ms_ease]",
        )}
        style={{ transformStyle: "preserve-3d" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shadow-xl">
          <PageView doc={doc} pageId={leftId} />
        </div>
        {rightId !== null && (
          <div className="shadow-xl">
            <PageView doc={doc} pageId={rightId} />
          </div>
        )}
      </div>

      <button
        onClick={() => go(1)}
        disabled={rightIndex >= pageOrder.length - 1}
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-card p-2 shadow-md ring-1 ring-border transition hover:bg-accent disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

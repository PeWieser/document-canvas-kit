import { useMemo, useState } from "react";
import { X, MessageSquare, Check, ChevronRight } from "lucide-react";
import { useEditor } from "@/store/editorStore";
import { useI18n } from "@/lib/i18n";
import type { CommentAnno } from "@/lib/pdf/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "open" | "resolved";

export function CommentsPanel({ onJump }: { onJump: (index: number) => void }) {
  const { t } = useI18n();
  const open = useEditor((s) => s.commentsPanelOpen);
  const toggle = useEditor((s) => s.toggleCommentsPanel);
  const annotations = useEditor((s) => s.annotations);
  const pageOrder = useEditor((s) => s.pageOrder);
  const select = useEditor((s) => s.select);
  const selectedId = useEditor((s) => s.selectedId);
  const [filter, setFilter] = useState<Filter>("all");

  const comments = useMemo(
    () => annotations.filter((a) => a.kind === "comment" || (a as any).comment || (a as any).text),
    [annotations],
  );

  const filtered = comments.filter((c) =>
    filter === "all" ? true : filter === "open" ? !(c as any).resolved : (c as any).resolved,
  );

  // group by display order of pages
  const byPage = useMemo(() => {
    const groups: { pageId: number; index: number; items: any[] }[] = [];
    pageOrder.forEach((pageId, index) => {
      const items = filtered.filter((c) => c.page === pageId);
      if (items.length) groups.push({ pageId, index, items });
    });
    return groups;
  }, [filtered, pageOrder]);

  if (!open) return null;

  const go = (c: any, index: number) => {
    onJump(index);
    select(c.id);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-[320px] max-w-[85vw] shrink-0 flex-col border-l border-border bg-sidebar shadow-2xl transition-all duration-200 md:relative md:inset-auto md:z-auto md:w-72 md:shadow-none">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("commentsPanel")}
        </span>
        <button onClick={toggle} className="rounded p-1 hover:bg-muted" title={t("toggleComments")}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(["all", "open", "resolved"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t(f === "all" ? "filterAll" : f === "open" ? "filterOpen" : "filterResolved")}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {byPage.length === 0 && (
          <p className="mt-6 text-center text-sm text-muted-foreground">{t("emptyComments")}</p>
        )}
        {byPage.map((group) => (
          <div key={group.pageId} className="mb-4">
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("page")} {group.index + 1}
            </div>
            <div className="space-y-1.5">
              {group.items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go(c, group.index)}
                  className={cn(
                    "w-full rounded-md border border-border p-2 text-left transition-colors hover:bg-muted",
                    selectedId === c.id && "ring-1 ring-primary",
                  )}
                  title={t("jumpToComment")}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                        c.resolved
                          ? "bg-emerald-500 text-white"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {c.resolved ? (
                        <Check className="h-2.5 w-2.5" />
                      ) : (
                        <MessageSquare className="h-2.5 w-2.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c.text || c.comment || (c as any).content || <span className="text-muted-foreground">…</span>}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-1 pl-5 text-xs text-muted-foreground">
                    {c.replies && c.replies.length > 0 ? `${c.replies.length} ${t("reply")}` : t("noReplies")}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

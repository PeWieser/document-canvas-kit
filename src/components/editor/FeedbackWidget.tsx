import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquarePlus,
  Send,
  Loader2,
  Sparkles,
  Bug,
  Paintbrush,
  MessageSquare,
  ThumbsDown,
  Trash2,
  Key,
  ShieldCheck,
  RefreshCw,
  X,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const WORKER_URL = "https://feedback-pdf.semole.workers.dev";

const CATEGORIES = [
  { id: "Wunsch", label: "Wunsch", icon: Sparkles, color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30" },
  { id: "Bug", label: "Fehler / Bug", icon: Bug, color: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  { id: "UI Verbesserung", label: "UI Verbesserung", icon: Paintbrush, color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  { id: "Kritik", label: "Kritik", icon: ThumbsDown, color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "Sonstiges", label: "Sonstiges", icon: MessageSquare, color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
];

const KONAMI_CODE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

interface FeedbackItem {
  id: string;
  category: string;
  message: string;
  created_at: string;
  user_agent?: string;
  url?: string;
}

export function FeedbackWidget() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Wunsch");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Admin Mode State (Unlocked via Konami Code)
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [adminApiKey, setAdminApiKey] = useState(() => localStorage.getItem("feedback_admin_key") || "");
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);
  const [filterCategory, setFilterCategory] = useState("Alle");

  const konamiBuffer = useRef<string[]>([]);

  // Konami Code Listener
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Do not trigger Konami code when typing inside input or textarea
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      konamiBuffer.current = [...konamiBuffer.current, key].slice(-KONAMI_CODE.length);

      if (konamiBuffer.current.join(",") === KONAMI_CODE.join(",")) {
        setIsAdminMode(true);
        toast.success("Konami Code erkannt! Admin-Modus aktiviert 🚀");
        konamiBuffer.current = [];
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Load feedbacks when Admin Mode is active and key is available
  useEffect(() => {
    if (isAdminMode && adminApiKey) {
      fetchFeedbacks();
    }
  }, [isAdminMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Bitte gib eine Beschreibung ein.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${WORKER_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message: message.trim(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      toast.success(t("feedbackSuccess"));
      setMessage("");
      setOpen(false);
    } catch (err) {
      console.error("Feedback submit error:", err);
      toast.error(t("feedbackError"));
    } finally {
      setSending(false);
    }
  };

  const fetchFeedbacks = async () => {
    if (!adminApiKey) {
      toast.error("Bitte gib den Admin API Key ein.");
      return;
    }

    setLoadingFeedbacks(true);
    try {
      localStorage.setItem("feedback_admin_key", adminApiKey);
      const res = await fetch(`${WORKER_URL}/api/feedback`, {
        headers: {
          "Content-Type": "application/json",
          "X-Admin-API-Key": adminApiKey,
        },
      });

      if (res.status === 401 || res.status === 403) {
        toast.error("Ungültiger Admin API Key!");
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const data = await res.json();
      setFeedbacks(data.feedbacks || []);
      toast.success(`${data.feedbacks?.length || 0} Feedbacks geladen.`);
    } catch (err) {
      console.error("Fetch feedbacks error:", err);
      toast.error("Fehler beim Laden der Feedbacks.");
    } finally {
      setLoadingFeedbacks(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDeleteFeedback"))) return;

    try {
      const res = await fetch(`${WORKER_URL}/api/feedback/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-API-Key": adminApiKey,
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      toast.success("Feedback gelöscht.");
    } catch (err) {
      console.error("Delete feedback error:", err);
      toast.error("Löschen fehlgeschlagen.");
    }
  };

  const filteredFeedbacks = filterCategory === "Alle"
    ? feedbacks
    : feedbacks.filter((f) => f.category === filterCategory);

  return (
    <>
      {/* Floating Feedback Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-95"
        title={t("feedbackTitle")}
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">{t("feedback")}</span>
      </button>

      {/* Feedback Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
                {isAdminMode ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <span>{t("adminMode")} (Cloudflare D1)</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 text-primary" />
                    <span>{t("feedbackTitle")}</span>
                  </>
                )}
              </DialogTitle>
              {isAdminMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAdminMode(false)}
                  className="text-xs text-muted-foreground"
                >
                  Formular
                </Button>
              )}
            </div>
            <DialogDescription>
              {isAdminMode
                ? "Verwalte, filtere und lösche eingegangene Feedbacks."
                : t("feedbackDesc")}
            </DialogDescription>
          </DialogHeader>

          {!isAdminMode ? (
            /* User Feedback Form */
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {t("category")}
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = category === cat.id;
                    return (
                      <button
                        type="button"
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`flex items-center gap-1.5 rounded-lg border p-2 text-left text-xs font-medium transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border/60 hover:border-primary/50 hover:bg-accent/50"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedbackPlaceholder")}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={sending} className="gap-2">
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{t("sendingFeedback")}</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>{t("submitFeedback")}</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          ) : (
            /* Admin Feedbacks List View */
            <div className="space-y-4 pt-2">
              {/* API Key Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="password"
                    placeholder="Admin API Key eingeben..."
                    value={adminApiKey}
                    onChange={(e) => setAdminApiKey(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button
                  onClick={fetchFeedbacks}
                  disabled={loadingFeedbacks}
                  size="sm"
                  className="gap-1.5"
                >
                  {loadingFeedbacks ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Laden
                </Button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex flex-wrap gap-1.5">
                {["Alle", ...CATEGORIES.map((c) => c.id)].map((cat) => (
                  <Button
                    key={cat}
                    variant={filterCategory === cat ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterCategory(cat)}
                    className="h-7 text-xs"
                  >
                    {cat}
                  </Button>
                ))}
              </div>

              {/* Feedback Entries List */}
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {filteredFeedbacks.length === 0 ? (
                  <p className="text-center py-6 text-xs text-muted-foreground">
                    {t("noFeedbackFound")}
                  </p>
                ) : (
                  filteredFeedbacks.map((item) => {
                    const catObj = CATEGORIES.find((c) => c.id === item.category) || {
                      color: "bg-secondary text-secondary-foreground border-border",
                      icon: MessageSquare,
                    };
                    const Icon = catObj.icon;
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border p-3 text-xs space-y-2 bg-card hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${catObj.color}`}>
                              <Icon className="h-3 w-3" />
                              {item.category}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(item.created_at).toLocaleString("de-DE")}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => handleDelete(item.id)}
                            title="Löschen"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                          {item.message}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

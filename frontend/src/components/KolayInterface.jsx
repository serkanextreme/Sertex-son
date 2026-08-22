import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Home,
  ListTodo,
  StickyNote,
  FolderOpen,
  Settings as SettingsIcon,
  Users,
  Plus,
  Search,
  Check,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { setInterfaceMode } from "../lib/appearance";

// Son tarih + duruma göre basit durum rozeti (Sertex'te ayrı "öncelik" alanı yok).
const bucketOf = (t) => {
  if (t.status === "done") return { label: "Tamamlandı", color: "#10b981" };
  if (t.status === "paused") return { label: "Beklemede", color: "#f59e0b" };
  const due = t.due_date ? new Date(t.due_date) : null;
  const now = new Date();
  if (due && due.getTime() < now.getTime()) return { label: "Süresi Geçti", color: "#f43f5e" };
  if (due && due.getTime() - now.getTime() < 2 * 86400000) return { label: "Yaklaşıyor", color: "#f59e0b" };
  return { label: "Aktif", color: "accent" };
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return null;
  }
};

/**
 * KOLAY arayüzü — sade, büyük, teknik olmayan kullanıcı dostu görev panosu.
 * Slim sol menü + arama + "Bugünkü Görevler" kart ızgarası + tek dokunuş Tamamla.
 * Görevler/Notlar/Dosyalar/Ayarlar mevcut panellere yönlendirir (özellik kaybı yok).
 */
const KolayInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      tasksApi.list(false, "mine").catch(() => []),
      taskCategoriesApi.list("my_tasks").catch(() => []),
    ])
      .then(([ts, cs]) => {
        setTasks(Array.isArray(ts) ? ts : []);
        setCats(Array.isArray(cs) ? cs : []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const catName = (id) => cats.find((c) => c.id === id)?.name || null;

  const activeTasks = useMemo(() => {
    const base = tasks.filter((t) => t.status !== "done" && !t.archived && !t.deleted);
    const query = q.trim().toLocaleLowerCase("tr");
    if (!query) return base;
    return base.filter((t) => {
      const hay = [t.title, t.description, t.assignee_name, t.company_name, catName(t.category_id)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return hay.includes(query);
    });
  }, [tasks, cats, q]);

  const completeTask = async (id) => {
    try {
      await tasksApi.setStatus(id, "done");
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "done" } : t)));
      toast.success("Görev tamamlandı");
    } catch {
      toast.error("Tamamlanamadı");
    }
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return "İyi geceler";
    if (h < 12) return "Günaydın";
    if (h < 18) return "İyi günler";
    return "İyi akşamlar";
  })();
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  const MENU = [
    { key: "home", label: "Ana Sayfa", icon: Home, onClick: null },
    { key: "tasks", label: "Görevler", icon: ListTodo, onClick: () => onOpenSection?.("tasks") },
    ...(teamFeaturesVisible ? [{ key: "team", label: "Ekip", icon: Users, onClick: () => onOpenSection?.("team") }] : []),
    { key: "notes", label: "Notlar", icon: StickyNote, onClick: () => onOpenSection?.("notes") },
    { key: "files", label: "Dosyalar", icon: FolderOpen, onClick: () => onOpenSection?.("files") },
    { key: "settings", label: "Ayarlar", icon: SettingsIcon, onClick: () => onOpenSettings?.() },
  ];

  return (
    <div
      className="absolute inset-0 z-10 overflow-y-auto scrollbar-sertex"
      data-testid="kolay-interface"
      style={{
        right: !isMobile && sidebarOpen ? 360 : 0,
        bottom: isMobile ? 64 : 0,
        transition: "right 300ms",
      }}
    >
      <div className="flex min-h-full">
        {/* Slim sol menü */}
        <div className="w-[132px] shrink-0 border-r border-sertex-cyan/15 p-3 flex flex-col gap-1.5 sticky top-0 self-start" data-testid="kolay-menu">
          <div className="display-text text-sertex-cyan neon-glow tracking-[0.15em] text-xs mb-2 px-1">
            GÖREV<br />MERKEZİ
          </div>
          {MENU.map((m) => {
            const Icon = m.icon;
            const active = m.key === "home";
            return (
              <button
                key={m.key}
                type="button"
                onClick={m.onClick || undefined}
                data-testid={`kolay-menu-${m.key}`}
                className={`w-full flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
                  active
                    ? "border-sertex-cyan bg-sertex-cyan/10 text-sertex-cyan"
                    : "border-transparent text-sertex-textMuted hover:text-sertex-cyan hover:bg-sertex-cyan/5"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-mono">{m.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { setInterfaceMode("detayli"); toast.success("Detaylı görünüme geçildi"); }}
            data-testid="kolay-switch-detayli"
            className="mt-auto w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-sertex-textMuted/30 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/50 transition-colors text-[9px] font-mono"
            title="Gelişmiş HUD görünümüne dön"
          >
            <Layers className="h-3.5 w-3.5" /> DETAYLI
          </button>
        </div>

        {/* İçerik */}
        <div className="flex-1 min-w-0 p-5 lg:p-8 max-w-[1100px]">
          {/* Karşılama */}
          <div className="mb-5">
            <div className="hud-text text-sertex-textMuted">{today}</div>
            <h1 className="display-text text-2xl lg:text-3xl text-sertex-cyan neon-glow mt-1">
              {greeting}, {user?.username || "Kullanıcı"}!
            </h1>
          </div>

          {/* Arama + Yeni Görev */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-sertex-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Görevlerde ara..."
                data-testid="kolay-search"
                className="w-full pl-10 pr-3 py-3 rounded-xl bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm placeholder:text-sertex-textMuted focus:border-sertex-cyan outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => onOpenSection?.("tasks")}
              data-testid="kolay-add-task"
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sertex-cyan/15 border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/25 transition-colors font-mono text-sm neon-glow"
            >
              <Plus className="h-4 w-4" /> Yeni Görev Ekle
            </button>
          </div>

          <div className="hud-text text-sertex-cyan mb-3">BUGÜNKÜ GÖREVLER</div>

          {loading ? (
            <div className="hud-text text-sertex-textMuted py-10 text-center" data-testid="kolay-loading">
              YÜKLENİYOR...
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="glass-panel corner-bracket rounded-xl p-8 text-center" data-testid="kolay-empty">
              <div className="text-sertex-text text-lg mb-1">🎉 Aktif görevin yok</div>
              <div className="hud-text text-sertex-textMuted normal-case mb-4">
                {q ? "Aramanla eşleşen görev bulunamadı." : "Yeni bir görev ekleyerek başla."}
              </div>
              {!q && (
                <button
                  type="button"
                  onClick={() => onOpenSection?.("tasks")}
                  data-testid="kolay-empty-add"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/10 font-mono text-sm"
                >
                  <Plus className="h-4 w-4" /> Görev Ekle
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="kolay-task-grid">
              {activeTasks.map((t, i) => {
                const b = bucketOf(t);
                const badgeColor = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
                const due = fmtDate(t.due_date);
                return (
                  <motion.div
                    key={t.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="glass-panel rounded-xl p-4 border border-sertex-cyan/25 flex flex-col"
                    data-testid={`kolay-card-${t.id}`}
                  >
                    <div className="text-sertex-text font-semibold leading-snug mb-1 line-clamp-2">
                      {t.title}
                    </div>
                    {catName(t.category_id) && (
                      <div className="hud-text text-sertex-textMuted normal-case mb-2">{catName(t.category_id)}</div>
                    )}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="h-2 w-2 rounded-full" style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}` }} />
                      <span className="text-[11px] font-mono" style={{ color: badgeColor }}>{b.label}</span>
                    </div>
                    <div className="mt-auto flex items-center justify-between">
                      <span className="hud-text text-sertex-textMuted normal-case">
                        {due ? `Son tarih: ${due}` : "Tarih yok"}
                      </span>
                      <button
                        type="button"
                        onClick={() => completeTask(t.id)}
                        data-testid={`kolay-complete-${t.id}`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/15 transition-colors text-xs font-mono"
                      >
                        <Check className="h-3.5 w-3.5" /> Tamamla
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KolayInterface;

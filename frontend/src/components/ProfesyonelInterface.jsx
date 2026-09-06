import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  ListTodo,
  StickyNote,
  FolderOpen,
  Settings as SettingsIcon,
  Users,
  Plus,
  Search,
  Bell,
  ChevronRight,
  Layers,
  Clock,
  Activity,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { setInterfaceMode } from "../lib/appearance";
import { EditTaskModal } from "./tasks/EditTaskModal";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const isActive = (t) => t.status !== "done" && !t.archived && !t.deleted;
const isOverdue = (t) => isActive(t) && t.due_date && new Date(t.due_date).getTime() < Date.now();

const bucketOf = (t) => {
  if (t.status === "done") return { label: "Tamamlandı", color: "#10b981" };
  if (t.status === "paused") return { label: "Beklemede", color: "#f59e0b" };
  if (isOverdue(t)) return { label: "Süresi Geçti", color: "#f43f5e" };
  const due = t.due_date ? new Date(t.due_date) : null;
  if (due && due.getTime() - Date.now() < 2 * 86400000) return { label: "Yaklaşıyor", color: "#f59e0b" };
  return { label: "Aktif", color: "accent" };
};

const progressOf = (t) => {
  const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
  if (subs.length) {
    const done = subs.filter((s) => s.done || s.status === "done").length;
    return Math.round((done / subs.length) * 100);
  }
  return t.status === "done" ? 100 : 0;
};

const fmtDate = (iso) => {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }); } catch { return null; }
};

const initials = (name) => (name || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

/**
 * PROFESYONEL arayüzü — cilalı kurumsal SaaS görünümü.
 * Düzenli sol menü + üst çubuk (breadcrumb/arama/kullanıcı) + istatistik kartları
 * + görev ızgarası (ilerleme çubuklu) + sağ sütun (son görevler / yaklaşan tarihler).
 * Mevcut API + navigasyon yeniden kullanılır; Detaylı görünüm dokunulmaz.
 */
const ProfesyonelInterface = ({ onOpenSection, onOpenSettings, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const [ts, cs] = await Promise.all([
      tasksApi.list(false, "mine").catch(() => []),
      taskCategoriesApi.list("my_tasks").catch(() => []),
    ]);
    setTasks(Array.isArray(ts) ? ts : []);
    setCats(Array.isArray(cs) ? cs : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catName = (id) => cats.find((c) => c.id === id)?.name || null;

  const stats = useMemo(() => {
    const active = tasks.filter(isActive);
    return {
      active: active.length,
      overdue: tasks.filter(isOverdue).length,
      done: tasks.filter((t) => t.status === "done" && !t.deleted).length,
      total: tasks.filter((t) => !t.deleted).length,
    };
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const base = tasks.filter(isActive);
    const query = q.trim().toLocaleLowerCase("tr");
    if (!query) return base;
    return base.filter((t) =>
      [t.title, t.description, t.assignee_name, t.company_name, catName(t.category_id)]
        .filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(query)
    );
  }, [tasks, cats, q]);

  const upcoming = useMemo(() =>
    tasks.filter((t) => isActive(t) && t.due_date && new Date(t.due_date).getTime() >= Date.now())
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 5),
  [tasks]);

  const recent = useMemo(() => tasks.filter(isActive).slice(0, 5), [tasks]);

  // İş koluna göre aktif görev dağılımı (en yoğun 6 kol).
  const catDist = useMemo(() => {
    const counts = {};
    tasks.filter(isActive).forEach((t) => {
      const key = t.category_id || "__none__";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([id, count]) => ({ name: id === "__none__" ? "Kolsuz" : (catName(id) || "?"), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [tasks, cats]);

  // Son 7 gün — günlük tamamlanan görev sayısı.
  const weekTrend = useMemo(() => {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ key: d.getTime(), label: d.toLocaleDateString("tr-TR", { weekday: "short" }), count: 0 });
    }
    tasks.forEach((t) => {
      if (t.status !== "done" || !t.completed_at) return;
      const c = new Date(t.completed_at);
      c.setHours(0, 0, 0, 0);
      const slot = days.find((x) => x.key === c.getTime());
      if (slot) slot.count += 1;
    });
    return days;
  }, [tasks]);

  const NAV = [
    { key: "home", label: "Panel", icon: LayoutDashboard, onClick: null },
    { key: "tasks", label: "Görevler", icon: ListTodo, onClick: () => onOpenSection?.("tasks") },
    ...(teamFeaturesVisible ? [{ key: "team", label: "Ekip", icon: Users, onClick: () => onOpenSection?.("team") }] : []),
    { key: "notes", label: "Notlar", icon: StickyNote, onClick: () => onOpenSection?.("notes") },
    { key: "files", label: "Dosyalar", icon: FolderOpen, onClick: () => onOpenSection?.("files") },
    { key: "settings", label: "Ayarlar", icon: SettingsIcon, onClick: () => onOpenSettings?.() },
  ];

  const STAT_CARDS = [
    { label: "Aktif Görevler", value: stats.active, color: "accent" },
    { label: "Geciken", value: stats.overdue, color: "#f43f5e" },
    { label: "Tamamlanan", value: stats.done, color: "#10b981" },
    { label: "Toplam", value: stats.total, color: "#8AB4F8" },
  ];

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden"
      data-testid="profesyonel-interface"
      style={{
        top: isMobile ? 0 : "var(--sx-sb-top, 0px)",
        right: isMobile ? 0 : "var(--sx-sb-right, 0px)",
        left: isMobile ? 0 : "var(--sx-sb-left, 0px)",
        bottom: isMobile ? 64 : "var(--sx-sb-bottom, 0px)",
        transition: "top 300ms, right 300ms, left 300ms, bottom 300ms",
      }}
    >
      <div className="flex h-full">
        {/* Sol menü */}
        <div className="w-[200px] shrink-0 border-r border-white/10 bg-black/20 p-4 flex flex-col gap-1 overflow-y-auto scrollbar-sertex" data-testid="prof-sidebar">
          <div className="display-text text-sertex-cyan tracking-[0.15em] text-base mb-4 px-1">SERTEX</div>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = n.key === "home";
            return (
              <button
                key={n.key}
                type="button"
                onClick={n.onClick || undefined}
                data-testid={`prof-nav-${n.key}`}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium ${
                  active ? "bg-sertex-cyan/15 text-sertex-cyan" : "text-sertex-textMuted hover:text-sertex-text hover:bg-white/5"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{n.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => { setInterfaceMode("detayli"); toast.success("Detaylı görünüme geçildi"); }}
            data-testid="prof-switch-detayli"
            className="mt-auto w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40 transition-colors text-xs"
          >
            <Layers className="h-3.5 w-3.5" /> Detaylı görünüm
          </button>
        </div>

        {/* Ana içerik */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Üst çubuk */}
          <div className="shrink-0 border-b border-white/10 px-6 py-3 flex items-center gap-4">
            <div className="hidden md:flex items-center gap-1.5 text-xs font-mono text-sertex-textMuted">
              <span>Panel</span><ChevronRight className="h-3 w-3" /><span>Genel Bakış</span>
              <ChevronRight className="h-3 w-3" /><span className="text-sertex-text">Görevler</span>
            </div>
            <div className="relative flex-1 max-w-md ml-auto">
              <Search className="h-4 w-4 text-sertex-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Görev ara..."
                data-testid="prof-search"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-sertex-surface/70 border border-white/10 text-sertex-text text-sm placeholder:text-sertex-textMuted focus:border-sertex-cyan outline-none"
              />
            </div>
            <button className="text-sertex-textMuted hover:text-sertex-cyan transition-colors" title="Bildirimler" data-testid="prof-bell">
              <Bell className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-sertex-cyan/20 border border-sertex-cyan/40 flex items-center justify-center text-sertex-cyan text-xs font-semibold">
                {initials(user?.username)}
              </div>
              <span className="hidden sm:block text-sm text-sertex-text">{user?.username}</span>
            </div>
          </div>

          {/* Kaydırılabilir gövde */}
          <div className="flex-1 overflow-y-auto scrollbar-sertex p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-bold text-sertex-text">Tekrar hoş geldin, {user?.username || "Kullanıcı"}!</h1>
                <div className="hud-text text-sertex-textMuted mt-1 normal-case tracking-normal">
                  {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenSection?.("tasks")}
                data-testid="prof-add-task"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sertex-cyan text-sertex-bg hover:opacity-90 transition-opacity text-sm font-semibold shrink-0"
              >
                <Plus className="h-4 w-4" /> Yeni Görev
              </button>
            </div>

            {/* İstatistik kartları */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6" data-testid="prof-stats">
              {STAT_CARDS.map((s) => {
                const color = s.color === "accent" ? "rgb(var(--sx-accent-rgb))" : s.color;
                return (
                  <div key={s.label} className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4">
                    <div className="hud-text text-sertex-textMuted normal-case tracking-normal">{s.label}</div>
                    <div className="text-3xl font-bold mt-1" style={{ color }}>{s.value}</div>
                  </div>
                );
              })}
            </div>

            {/* Analiz grafikleri */}
            {!loading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6" data-testid="prof-charts">
                <div className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4" data-testid="prof-chart-catdist">
                  <div className="flex items-center gap-1.5 text-sertex-text font-semibold mb-3 text-sm">
                    <BarChart3 className="h-4 w-4 text-sertex-cyan" /> İş Koluna Göre Dağılım
                  </div>
                  {catDist.length === 0 ? (
                    <div className="hud-text text-sertex-textMuted normal-case py-8 text-center">Aktif görev yok</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={catDist} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: "#9aa4b2", fontSize: 10 }} interval={0} tickLine={false} axisLine={false} />
                        <YAxis allowDecimals={false} tick={{ fill: "#9aa4b2", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e5e7eb" }} />
                        <Bar dataKey="count" fill="rgb(var(--sx-accent-rgb))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4" data-testid="prof-chart-trend">
                  <div className="flex items-center gap-1.5 text-sertex-text font-semibold mb-3 text-sm">
                    <TrendingUp className="h-4 w-4 text-sertex-cyan" /> Son 7 Gün — Tamamlanan
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={weekTrend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#9aa4b2", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} tick={{ fill: "#9aa4b2", fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                      <Tooltip contentStyle={{ background: "#0b0f1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#e5e7eb" }} />
                      <Line type="monotone" dataKey="count" stroke="rgb(var(--sx-accent-rgb))" strokeWidth={2} dot={{ r: 3, fill: "rgb(var(--sx-accent-rgb))" }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
              {/* Görev ızgarası */}
              <div className="xl:col-span-2">
                <div className="hud-text text-sertex-textMuted normal-case tracking-normal mb-2">GÖREVLER</div>
                {loading ? (
                  <div className="hud-text text-sertex-textMuted py-10 text-center" data-testid="prof-loading">YÜKLENİYOR...</div>
                ) : visibleTasks.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-sertex-surface/60 p-8 text-center" data-testid="prof-empty">
                    <div className="text-sertex-text mb-1">Aktif görev yok</div>
                    <div className="hud-text text-sertex-textMuted normal-case">{q ? "Eşleşme bulunamadı." : "Yeni görev ekleyerek başla."}</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="prof-task-grid">
                    {visibleTasks.map((t, i) => {
                      const b = bucketOf(t);
                      const badgeColor = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
                      const prog = progressOf(t);
                      const due = fmtDate(t.due_date);
                      return (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.03, 0.3) }}
                          onClick={() => setEditing(t)}
                          role="button"
                          className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4 hover:border-sertex-cyan/40 transition-colors cursor-pointer"
                          data-testid={`prof-card-${t.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="text-sertex-text font-semibold leading-snug line-clamp-2">{t.title}</div>
                            {t.assignee_name && (
                              <div className="h-6 w-6 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-sertex-textSecondary" title={t.assignee_name}>
                                {initials(t.assignee_name)}
                              </div>
                            )}
                          </div>
                          {catName(t.category_id) && (
                            <div className="hud-text text-sertex-textMuted normal-case tracking-normal mb-2">{catName(t.category_id)}</div>
                          )}
                          <div className="flex items-center gap-1.5 mb-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: badgeColor }} />
                            <span className="text-[11px] font-mono" style={{ color: badgeColor }}>{b.label}</span>
                            {due && <span className="ml-auto hud-text text-sertex-textMuted normal-case tracking-normal">{due}</span>}
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${prog}%`, background: "rgb(var(--sx-accent-rgb))" }} />
                          </div>
                          <div className="text-right hud-text text-sertex-textMuted normal-case tracking-normal mt-1">%{prog}</div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sağ sütun */}
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4" data-testid="prof-recent">
                  <div className="flex items-center gap-1.5 text-sertex-text font-semibold mb-3">
                    <Activity className="h-4 w-4 text-sertex-cyan" /> Son Görevler
                  </div>
                  {recent.length === 0 ? (
                    <div className="hud-text text-sertex-textMuted normal-case">Kayıt yok</div>
                  ) : recent.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: bucketOf(t).color === "accent" ? "rgb(var(--sx-accent-rgb))" : bucketOf(t).color }} />
                      <span className="text-sm text-sertex-textSecondary truncate">{t.title}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-white/10 bg-sertex-surface/60 p-4" data-testid="prof-upcoming">
                  <div className="flex items-center gap-1.5 text-sertex-text font-semibold mb-3">
                    <Clock className="h-4 w-4 text-sertex-cyan" /> Yaklaşan Son Tarihler
                  </div>
                  {upcoming.length === 0 ? (
                    <div className="hud-text text-sertex-textMuted normal-case">Yaklaşan tarih yok</div>
                  ) : upcoming.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
                      <span className="text-sm text-sertex-textSecondary truncate">{t.title}</span>
                      <span className="hud-text text-sertex-cyan normal-case tracking-normal shrink-0">{fmtDate(t.due_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <EditTaskModal
          task={editing}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try {
              await tasksApi.update(editing.id, patch);
              await load();
              toast.success("Kaydedildi");
            } catch {
              toast.error("Kaydedilemedi");
            }
          }}
          isTeamView={false}
          categories={cats}
          teamMembers={[]}
          currentUser={user}
        />
      )}
    </div>
  );
};

export default ProfesyonelInterface;

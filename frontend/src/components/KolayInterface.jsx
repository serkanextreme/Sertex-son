import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, Reorder, useDragControls } from "framer-motion";
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
  MoreVertical,
  GripVertical,
  Pause,
  Play,
  Edit3,
  Tag,
  Archive,
  Trash2,
  Share2,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDialog } from "../lib/confirm";
import { flattenTree } from "../lib/categoryTree";
import { EditTaskModal } from "./tasks/EditTaskModal";
import { ShareTaskModal } from "./tasks/ShareTaskModal";

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
 * KOLAY arayüzü — SADE görünüm korunur (slim menü + arama + "Bugünkü Görevler"
 * kart ızgarası). Kartların üstüne, panel chrome'u GETİRMEDEN, Neural Link
 * fonksiyonları eklendi: her kartta ⋮ menü (Düzenle/Tamamla/Beklet/Aktif/İş
 * koluna taşı/Paylaş/Arşivle/Sil), sürükle-sırala (⠿ tutamaç) + sıra numarası,
 * arama altında iş kolu seçici. Detaylı görünüm hiç değişmez.
 */

// Sade kart gövdesi (görsel) — sürüklenebilir/statik iki sarmalayıcı da bunu kullanır.
const KolayCardBody = ({ task, index, catName, onComplete, onMenu, dragControls }) => {
  const b = bucketOf(task);
  const badgeColor = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
  const due = fmtDate(task.due_date);
  return (
    <div
      className="glass-panel rounded-xl p-4 border border-sertex-cyan/25 flex flex-col h-full relative group"
      data-testid={`kolay-card-${task.id}`}
    >
      {dragControls && (
        <button
          type="button"
          onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
          data-testid={`kolay-drag-${task.id}`}
          title="Sürükleyip sırala"
          aria-label="Sürükleyip sırala"
          className="absolute top-2 left-2 opacity-30 hover:opacity-100 text-sertex-cyan/70 hover:text-sertex-cyan cursor-grab active:cursor-grabbing transition-opacity"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {/* ⋮ menü */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          onMenu(task, r);
        }}
        data-testid={`kolay-menu-btn-${task.id}`}
        aria-label="Görev menüsü"
        className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-lg border border-sertex-cyan/30 text-sertex-cyan hover:bg-sertex-cyan/15 hover:border-sertex-cyan transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <div className="text-sertex-text font-semibold leading-snug mb-1 line-clamp-2 pr-8 pl-5">
        <span className="text-sertex-cyan tabular-nums font-mono mr-1" data-testid={`kolay-num-${task.id}`}>
          {index + 1}.
        </span>
        {task.title}
      </div>
      {catName(task.category_id) && (
        <div className="hud-text text-sertex-textMuted normal-case mb-2 pl-5">{catName(task.category_id)}</div>
      )}
      <div className="flex items-center gap-1.5 mb-3 pl-5">
        <span className="h-2 w-2 rounded-full" style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}` }} />
        <span className="text-[11px] font-mono" style={{ color: badgeColor }}>{b.label}</span>
      </div>
      <div className="mt-auto flex items-center justify-between">
        <span className="hud-text text-sertex-textMuted normal-case">
          {due ? `Son tarih: ${due}` : "Tarih yok"}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onComplete(task); }}
          data-testid={`kolay-complete-${task.id}`}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/15 transition-colors text-xs font-mono"
        >
          <Check className="h-3.5 w-3.5" /> Tamamla
        </button>
      </div>
    </div>
  );
};

// Sürüklenebilir sarmalayıcı — Reorder.Item + kendi drag controls'u.
const KolayReorderItem = ({ task, index, catName, onComplete, onMenu }) => {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={task}
      dragListener={false}
      dragControls={controls}
      as="div"
      layout
    >
      <KolayCardBody
        task={task}
        index={index}
        catName={catName}
        onComplete={onComplete}
        onMenu={onMenu}
        dragControls={controls}
      />
    </Reorder.Item>
  );
};

const KolayInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState(""); // "" = tümü · "__none__" = kolsuz · id
  const [menu, setMenu] = useState(null); // { task, x, y }
  const [catSub, setCatSub] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const reorderTimer = useRef(null);

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

  const flatCats = useMemo(() => flattenTree(cats), [cats]);
  const catName = (id) => flatCats.find((c) => c.id === id)?.name || null;

  const activeTasks = useMemo(() => {
    let base = tasks.filter((t) => t.status !== "done" && !t.archived && !t.deleted);
    if (catFilter === "__none__") base = base.filter((t) => !t.category_id);
    else if (catFilter) base = base.filter((t) => t.category_id === catFilter);
    const query = q.trim().toLocaleLowerCase("tr");
    if (!query) return base;
    return base.filter((t) => {
      const hay = [t.title, t.description, t.assignee_name, t.company_name, catName(t.category_id)]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr");
      return hay.includes(query);
    });
  }, [tasks, flatCats, q, catFilter]);

  const canReorder = !q.trim() && !catFilter;

  const closeMenu = () => { setMenu(null); setCatSub(false); };

  // ---- Aksiyonlar (tasksApi + reload) ----
  const completeTask = async (t) => {
    try {
      await tasksApi.setStatus(t.id, "done");
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)));
      toast.success("Görev tamamlandı");
    } catch {
      toast.error("Tamamlanamadı");
    }
  };
  const doStatus = async (t, status, label) => {
    closeMenu();
    try {
      await tasksApi.setStatus(t.id, status);
      toast.success(label);
      load();
    } catch {
      toast.error("Güncellenemedi");
    }
  };
  const doArchive = async (t) => {
    closeMenu();
    try {
      await tasksApi.setArchived(t.id, true);
      toast.success("Arşivlendi");
      load();
    } catch {
      toast.error("Arşivlenemedi");
    }
  };
  const doDelete = async (t) => {
    closeMenu();
    const ok = await confirmDialog({
      title: "GÖREVİ SİL",
      message: `"${t.title}" silinsin mi?\nGörev çöp kutusuna taşınır.`,
      confirmText: "SİL",
      cancelText: "VAZGEÇ",
      danger: true,
    });
    if (!ok) return;
    try {
      await tasksApi.delete(t.id);
      toast.success("Silindi");
      load();
    } catch {
      toast.error("Silinemedi");
    }
  };
  const doCategory = async (t, catId) => {
    closeMenu();
    try {
      await tasksApi.update(t.id, { category_id: catId });
      toast.success(catId ? "İş koluna taşındı" : "İş kolundan çıkarıldı");
      load();
    } catch {
      toast.error("Taşınamadı");
    }
  };
  const saveEdit = async (patch) => {
    try {
      await tasksApi.update(editing.id, patch);
      load();
      toast.success("Kaydedildi");
    } catch {
      toast.error("Kaydedilemedi");
    }
  };

  const handleReorder = (next) => {
    setTasks((prev) => {
      const activeIds = new Set(next.map((t) => t.id));
      const rest = prev.filter((t) => !activeIds.has(t.id));
      return [...next, ...rest];
    });
    if (reorderTimer.current) clearTimeout(reorderTimer.current);
    reorderTimer.current = setTimeout(() => {
      tasksApi.reorder(next.map((t) => t.id)).catch(() => {});
    }, 600);
  };

  const openMenu = (task, rect) => {
    setCatSub(false);
    // Menü genişliği ~220 — butonun soluna/altına yerleştir, ekran dışına taşma.
    const x = Math.min(rect.right, window.innerWidth - 8) - 220;
    const y = Math.min(rect.bottom + 4, window.innerHeight - 360);
    setMenu({ task, x: Math.max(8, x), y: Math.max(8, y) });
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
    { key: "tasks", label: "Görevler", icon: ListTodo, onClick: null },
    ...(teamFeaturesVisible ? [{ key: "team", label: "Ekip", icon: Users, onClick: () => onOpenSection?.("team") }] : []),
    { key: "notes", label: "Notlar", icon: StickyNote, onClick: () => onOpenSection?.("notes") },
    { key: "files", label: "Dosyalar", icon: FolderOpen, onClick: () => onOpenSection?.("files") },
    { key: "settings", label: "Ayarlar", icon: SettingsIcon, onClick: () => onOpenSettings?.() },
  ];

  const menuTask = menu?.task;

  const renderCard = (t, i) => (
    <KolayCardBody
      key={t.id}
      task={t}
      index={i}
      catName={catName}
      onComplete={completeTask}
      onMenu={openMenu}
    />
  );

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
        {/* Slim sol menü — DETAYLI düğmesi kaldırıldı (Ayarlar → Temalar'dan geçilir). */}
        <div className="w-[132px] shrink-0 border-r border-sertex-cyan/15 p-3 flex flex-col gap-1.5 sticky top-0 self-start" data-testid="kolay-menu">
          <div className="display-text text-sertex-cyan neon-glow tracking-[0.15em] text-xs mb-2 px-1">
            GÖREV<br />MERKEZİ
          </div>
          {MENU.map((m) => {
            const Icon = m.icon;
            const active = m.key === "home" || m.key === "tasks";
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
          <div className="flex flex-col sm:flex-row gap-3 mb-3">
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

          {/* İş kolu seçici — arama çubuğunun altında (Neural Link'teki gibi). */}
          {flatCats.length > 0 && (
            <div
              className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-sertex pb-1"
              data-testid="kolay-cat-filter"
            >
              {[{ id: "", name: "Tümü" }, ...flatCats, { id: "__none__", name: "Kolsuz" }].map((c) => {
                const sel = catFilter === c.id;
                return (
                  <button
                    key={c.id || "all"}
                    type="button"
                    onClick={() => setCatFilter(c.id)}
                    data-testid={`kolay-cat-chip-${c.id || "all"}`}
                    style={{ flexShrink: 0 }}
                    className={`px-3 py-1.5 rounded-full border text-xs font-mono transition-colors whitespace-nowrap ${
                      sel
                        ? "border-sertex-cyan bg-sertex-cyan/15 text-sertex-cyan"
                        : "border-sertex-cyan/25 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/50"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="hud-text text-sertex-cyan mb-3">BUGÜNKÜ GÖREVLER</div>

          {loading ? (
            <div className="hud-text text-sertex-textMuted py-10 text-center" data-testid="kolay-loading">
              YÜKLENİYOR...
            </div>
          ) : activeTasks.length === 0 ? (
            <div className="glass-panel corner-bracket rounded-xl p-8 text-center" data-testid="kolay-empty">
              <div className="text-sertex-text text-lg mb-1">🎉 Aktif görevin yok</div>
              <div className="hud-text text-sertex-textMuted normal-case mb-4">
                {q || catFilter ? "Eşleşen görev bulunamadı." : "Yeni bir görev ekleyerek başla."}
              </div>
              {!q && !catFilter && (
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
          ) : canReorder ? (
            <Reorder.Group
              axis="y"
              values={activeTasks}
              onReorder={handleReorder}
              as="div"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
              data-testid="kolay-task-grid"
            >
              {activeTasks.map((t, i) => (
                <KolayReorderItem
                  key={t.id}
                  task={t}
                  index={i}
                  catName={catName}
                  onComplete={completeTask}
                  onMenu={openMenu}
                />
              ))}
            </Reorder.Group>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="kolay-task-grid">
              {activeTasks.map((t, i) => renderCard(t, i))}
            </div>
          )}
        </div>
      </div>

      {/* ⋮ MENÜ (portal) */}
      {menu && menuTask && createPortal(
          <div
            className="fixed inset-0 z-[100]"
            onClick={closeMenu}
            onContextMenu={(e) => { e.preventDefault(); closeMenu(); }}
            data-testid="kolay-menu-overlay"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="fixed glass-panel border border-sertex-cyan/40 rounded-lg py-1 shadow-lg min-w-[220px]"
              style={{ left: menu.x, top: menu.y, maxHeight: "calc(100vh - 16px)", overflowY: "auto" }}
              onClick={(e) => e.stopPropagation()}
              data-testid="kolay-task-menu"
            >
              {!catSub ? (
                <>
                  <MenuBtn icon={Edit3} label="Düzenle" onClick={() => { setEditing(menuTask); closeMenu(); }} testid="kolay-ctx-edit" />
                  {menuTask.status !== "done" && (
                    <MenuBtn icon={Check} label="Tamamlandı" color="text-emerald-300 hover:bg-emerald-500/15" onClick={() => doStatus(menuTask, "done", "Görev tamamlandı")} testid="kolay-ctx-done" />
                  )}
                  {menuTask.status !== "paused" && (
                    <MenuBtn icon={Pause} label="Beklemeye al" color="text-yellow-300 hover:bg-yellow-500/15" onClick={() => doStatus(menuTask, "paused", "Beklemeye alındı")} testid="kolay-ctx-paused" />
                  )}
                  {menuTask.status !== "pending" && (
                    <MenuBtn icon={Play} label="Aktif yap" onClick={() => doStatus(menuTask, "pending", "Aktif yapıldı")} testid="kolay-ctx-pending" />
                  )}
                  {flatCats.length > 0 && (
                    <MenuBtn icon={Tag} label="İş Koluna Taşı" hasSub onClick={() => setCatSub(true)} testid="kolay-ctx-category" />
                  )}
                  <MenuBtn icon={Share2} label="Özellik Tanımla (Paylaş)" onClick={() => { setSharing(menuTask); closeMenu(); }} testid="kolay-ctx-share" />
                  <MenuBtn icon={Archive} label="Arşivle" onClick={() => doArchive(menuTask)} testid="kolay-ctx-archive" />
                  <MenuBtn icon={Trash2} label="Sil" color="text-rose-300 hover:bg-rose-500/15" onClick={() => doDelete(menuTask)} testid="kolay-ctx-delete" />
                </>
              ) : (
                <div data-testid="kolay-ctx-category-sub">
                  <div className="hud-text text-sertex-cyan px-3 py-1.5 border-b border-sertex-cyan/20 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> İŞ KOLU SEÇ
                  </div>
                  <MenuBtn
                    icon={Tag}
                    label="Kolsuz"
                    active={!menuTask.category_id}
                    onClick={() => doCategory(menuTask, null)}
                    testid="kolay-ctx-cat-none"
                  />
                  {flatCats.map((c) => (
                    <MenuBtn
                      key={c.id}
                      icon={Tag}
                      label={c.name}
                      active={menuTask.category_id === c.id}
                      onClick={() => doCategory(menuTask, c.id)}
                      testid={`kolay-ctx-cat-${c.id}`}
                    />
                  ))}
                  <button
                    onClick={() => setCatSub(false)}
                    className="w-full text-left px-3 py-1.5 hud-text text-sertex-textMuted hover:text-sertex-cyan border-t border-sertex-cyan/15"
                  >
                    ← Geri
                  </button>
                </div>
              )}
            </motion.div>
          </div>,
          document.body,
        )}

      {/* Düzenle / Paylaş modalları — Neural Link ile aynı bileşenler. */}
      {editing && (
        <EditTaskModal
          task={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
          isTeamView={false}
          categories={cats}
          teamMembers={[]}
          currentUser={user}
        />
      )}
      {sharing && (
        <ShareTaskModal
          task={sharing}
          onClose={() => setSharing(null)}
          onSaved={() => { setSharing(null); load(); }}
        />
      )}
    </div>
  );
};

// Küçük menü butonu yardımcı bileşeni.
const MenuBtn = ({ icon: Icon, label, onClick, color, hasSub, active, testid }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testid}
    className={`w-full text-left px-3 py-1.5 hud-text flex items-center gap-2 transition-colors ${
      color || "text-sertex-cyan hover:bg-sertex-cyan/10"
    } ${active ? "bg-sertex-cyan/10" : ""}`}
  >
    <Icon className="h-3.5 w-3.5 shrink-0" />
    <span className="flex-1">{label}</span>
    {active && <Check className="h-3 w-3" />}
    {hasSub && <ChevronRight className="h-3 w-3 opacity-60" />}
  </button>
);

export default KolayInterface;

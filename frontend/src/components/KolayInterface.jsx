import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  X,
  AlertTriangle,
  Clock,
  FileText,
  Anchor,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi, taskLockApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { confirmDialog } from "../lib/confirm";
import { flattenTree } from "../lib/categoryTree";
import { ContextMenu } from "./TaskContextMenu";
import { EditTaskModal } from "./tasks/EditTaskModal";
import { ShareTaskModal } from "./tasks/ShareTaskModal";
import { ReassignModal } from "./tasks/ReassignModal";
import { LockConfigModal } from "./tasks/LockConfigModal";
import { UnlockOtpModal } from "./tasks/UnlockOtpModal";
import { OtpDisplayModal } from "./tasks/OtpDisplayModal";
import { LinkTasksModal } from "./tasks/LinkTasksModal";
import { printTasks, exportTasksExcel, exportTasksWord } from "../lib/taskExport";

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

const fmtDateTime = (iso) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return null;
  }
};

// Zengin kart gövdesi — referans görsele göre (kutucuk + uyarı ikonu + ⚓ + 🕐 + 📄 etiket + küçült/menü).
const KolayCardBody = ({ task, number, catName, onComplete, onMenu, collapsed, onToggleCollapse, dragHandleProps }) => {
  const b = bucketOf(task);
  const badgeColor = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
  const overdue = b.label === "Süresi Geçti";
  const dt = fmtDateTime(task.due_date);
  const cat = catName(task.category_id);
  const tag = task.company_name || task.assignee_name || null;
  const pinnedNum = task.number_pinned && task.pinned_number != null ? task.pinned_number : number;

  return (
    <div
      className="glass-panel rounded-xl p-3.5 border border-sertex-cyan/25 flex flex-col h-full relative group"
      data-testid={`kolay-card-${task.id}`}
      style={overdue ? { borderColor: "rgba(244,63,94,0.45)" } : undefined}
    >
      {/* Üst şerit: sol = sürükle + tamamla kutucuğu · sağ = küçült/büyüt + ⋮ */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {dragHandleProps && (
            <button
              type="button"
              {...dragHandleProps}
              data-testid={`kolay-drag-${task.id}`}
              title="Sürükleyip sırala"
              aria-label="Sürükleyip sırala"
              className="opacity-30 hover:opacity-100 text-sertex-cyan/70 hover:text-sertex-cyan cursor-grab active:cursor-grabbing transition-opacity touch-none"
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onComplete(task); }}
            data-testid={`kolay-check-${task.id}`}
            title="Tamamla"
            aria-label="Görevi tamamla"
            className="h-5 w-5 flex items-center justify-center rounded-md border-2 border-emerald-400/60 text-emerald-300 hover:bg-emerald-400/20 hover:border-emerald-400 transition-colors group/chk"
          >
            <Check className="h-3.5 w-3.5 opacity-0 group-hover/chk:opacity-100 transition-opacity" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse(task.id); }}
            data-testid={`kolay-collapse-${task.id}`}
            title={collapsed ? "Büyüt" : "Küçült"}
            aria-label={collapsed ? "Büyüt" : "Küçült"}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-sertex-cyan/30 text-sertex-cyan hover:bg-sertex-cyan/15 hover:border-sertex-cyan transition-colors"
          >
            {collapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              onMenu(task, r);
            }}
            data-testid={`kolay-menu-btn-${task.id}`}
            aria-label="Görev menüsü"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-sertex-cyan/30 text-sertex-cyan hover:bg-sertex-cyan/15 hover:border-sertex-cyan transition-colors"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Durum etiketi (süresi geçtiyse uyarı ikonu) */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {overdue ? (
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: badgeColor }} />
        ) : (
          <span className="h-2 w-2 rounded-full" style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}` }} />
        )}
        <span className="text-[11px] font-mono font-semibold tracking-wide" style={{ color: badgeColor }}>{b.label}</span>
      </div>

      {/* Başlık: sıra no + ⚓ (sabitse) + başlık */}
      <div className={`text-sertex-text font-semibold leading-snug ${collapsed ? "line-clamp-1" : "line-clamp-2"}`}>
        <span className="text-sertex-cyan tabular-nums font-mono mr-1 inline-flex items-center" data-testid={`kolay-num-${task.id}`}>
          {pinnedNum}.
          {task.number_pinned && <Anchor className="h-3 w-3 ml-0.5 text-amber-300" data-testid={`kolay-pin-${task.id}`} />}
        </span>
        {task.title}
      </div>

      {!collapsed && (
        <>
          {task.description && (
            <div className="hud-text text-sertex-textMuted normal-case mt-1 line-clamp-2">{task.description}</div>
          )}

          <div className="mt-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              <Clock className="h-3.5 w-3.5 text-sertex-cyan/70 shrink-0" />
              <span className={dt ? "text-sertex-textMuted" : "text-sertex-textMuted/60"}>
                {dt ? `BİTİŞ: ${dt}` : "Tarih yok"}
              </span>
            </div>
            {(tag || cat) && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono">
                <FileText className="h-3.5 w-3.5 text-sertex-cyan/70 shrink-0" />
                <span className="text-sertex-textMuted truncate">{tag || cat}</span>
                {tag && cat && <span className="text-sertex-textMuted/50 truncate">· {cat}</span>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// dnd-kit sürüklenebilir sarmalayıcı (2 yönlü ızgara sıralaması).
const KolaySortableCard = ({ task, number, catName, onComplete, onMenu, collapsed, onToggleCollapse }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <KolayCardBody
        task={task}
        number={number}
        catName={catName}
        onComplete={onComplete}
        onMenu={onMenu}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        dragHandleProps={listeners}
      />
    </div>
  );
};

// Kolay içi görev ekleme formu (Neural Link'e ATMADAN).
const KolayAddModal = ({ cats, onClose, onCreated }) => {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [catId, setCatId] = useState("");
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);
  const flat = useMemo(() => flattenTree(cats), [cats]);

  const submit = async () => {
    if (!title.trim()) { toast.error("Başlık gerekli"); return; }
    setSaving(true);
    try {
      await tasksApi.create(
        title.trim(),
        desc.trim(),
        due ? new Date(due).toISOString() : null,
        null,
        catId ? { category_id: catId } : {},
      );
      toast.success("Görev eklendi");
      onCreated();
      onClose();
    } catch {
      toast.error("Görev eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} data-testid="kolay-add-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel border border-sertex-cyan/40 rounded-xl p-5 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        data-testid="kolay-add-modal"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="display-text text-sertex-cyan neon-glow flex items-center gap-2"><Plus className="h-4 w-4" /> YENİ GÖREV</div>
          <button onClick={onClose} data-testid="kolay-add-close" className="text-sertex-textMuted hover:text-sertex-cyan"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="hud-text text-sertex-textMuted mb-1">BAŞLIK</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              autoFocus
              data-testid="kolay-add-title"
              placeholder="Görev başlığı..."
              className="w-full px-3 py-2.5 rounded-lg bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm focus:border-sertex-cyan outline-none"
            />
          </div>
          <div>
            <div className="hud-text text-sertex-textMuted mb-1">AÇIKLAMA</div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              data-testid="kolay-add-desc"
              rows={2}
              placeholder="Opsiyonel açıklama..."
              className="w-full px-3 py-2.5 rounded-lg bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm focus:border-sertex-cyan outline-none resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="hud-text text-sertex-textMuted mb-1">İŞ KOLU</div>
              <select
                value={catId}
                onChange={(e) => setCatId(e.target.value)}
                data-testid="kolay-add-cat"
                className="w-full px-3 py-2.5 rounded-lg bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm focus:border-sertex-cyan outline-none"
              >
                <option value="">— İş kolu yok —</option>
                {flat.map((c) => (
                  <option key={c.id} value={c.id}>{"\u00A0".repeat((c.__depth || 0) * 2)}{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <div className="hud-text text-sertex-textMuted mb-1">SON TARİH</div>
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                data-testid="kolay-add-due"
                className="w-full px-3 py-2.5 rounded-lg bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm focus:border-sertex-cyan outline-none"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} data-testid="kolay-add-cancel" className="px-4 py-2 rounded-lg border border-sertex-textMuted/30 text-sertex-textMuted hover:text-sertex-text font-mono text-sm">İPTAL</button>
          <button onClick={submit} disabled={saving} data-testid="kolay-add-submit" className="px-4 py-2 rounded-lg bg-sertex-cyan/15 border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/25 font-mono text-sm neon-glow disabled:opacity-50">
            {saving ? "EKLENİYOR..." : "EKLE"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

const KolayInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [activeKey, setActiveKey] = useState("home");
  const [showAdd, setShowAdd] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const toggleCollapse = (id) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  // ⋮ menü + modallar
  const [ctxMenu, setCtxMenu] = useState(null); // { task, x, y }
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [reassigning, setReassigning] = useState(null);
  const [lockConfig, setLockConfig] = useState(null);
  const [unlockOtp, setUnlockOtp] = useState(null);
  const [otpDisplay, setOtpDisplay] = useState(null);
  const [linkModal, setLinkModal] = useState(null); // { mode, taskId?, groupId? }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = () => {
    setLoading(true);
    Promise.all([
      tasksApi.list(false, "mine").catch(() => []),
      taskCategoriesApi.list("my_tasks").catch(() => []),
      tasksApi.listGroups().catch(() => []),
    ])
      .then(([ts, cs, gs]) => {
        setTasks(Array.isArray(ts) ? ts : []);
        setCats(Array.isArray(cs) ? cs : []);
        setGroups(Array.isArray(gs) ? gs : []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const flatCats = useMemo(() => flattenTree(cats), [cats]);
  const catName = (id) => flatCats.find((c) => c.id === id)?.name || null;
  const groupById = useMemo(() => Object.fromEntries((groups || []).map((g) => [g.id, g])), [groups]);

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

  const numberOf = useMemo(() => {
    const m = {};
    activeTasks.forEach((t, i) => { m[t.id] = i + 1; });
    return m;
  }, [activeTasks]);

  const canReorder = !q.trim() && !catFilter;
  const closeMenu = () => setCtxMenu(null);

  // ---- Aksiyonlar (tasksApi + reload) — TasksPanel ile aynı davranış ----
  const completeTask = async (t) => {
    try {
      await tasksApi.setStatus(t.id, "done");
      setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "done" } : x)));
      toast.success("Görev tamamlandı");
    } catch { toast.error("Tamamlanamadı"); }
  };
  const setStatus = async (id, status) => {
    try { await tasksApi.setStatus(id, status); load(); } catch { toast.error("Güncellenemedi"); }
  };
  const setArchived = async (id, archived) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast.success(archived ? "Görev arşivlendi" : "Arşivden çıkarıldı");
    try { await tasksApi.setArchived(id, archived); } catch { toast.error("İşlem başarısız — geri alınıyor"); load(); }
  };
  const removeTask = async (id, title) => {
    const ok = await confirmDialog({ title: "GÖREVİ SİL", message: `"${title}" çöp kutusuna taşınsın mı?`, confirmText: "SİL", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { await tasksApi.delete(id); load(); toast.success("Çöp kutusuna taşındı"); }
    catch (e) { toast.error(e?.response?.status === 423 ? (e.response.data?.detail || "Görev kilitli") : "Silinemedi"); }
  };
  const cancelTask = async (id, title) => {
    const ok = await confirmDialog({ title: "GÖREVİ İPTAL ET", message: `"${title}" iptal edilsin mi?\nArşivin İPTAL grubuna taşınır.`, confirmText: "İPTAL ET", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { await tasksApi.cancel(id); load(); toast.success("Görev iptal edildi"); }
    catch (e) { toast.error(e?.response?.status === 423 ? (e.response.data?.detail || "Görev kilitli") : "İptal başarısız"); }
  };
  const setTaskCategory = async (id, categoryId) => {
    try {
      await tasksApi.update(id, { category_id: categoryId || "" });
      const name = categoryId ? (catName(categoryId) || "İş Kolu") : "Kolsuz";
      toast.success(`Görev → ${name}`); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Değiştirilemedi"); }
  };
  const setTaskReminderDays = async (id, days) => {
    try { await tasksApi.update(id, { reminder_days: days == null ? 0 : days, reminder_disabled: false }); toast.success(days == null ? "Uyarı: varsayılan" : `Uyarı: ${days} gün önce`); load(); }
    catch { toast.error("Değiştirilemedi"); }
  };
  const setTaskReminderDisabled = async (id, disabled) => {
    try { await tasksApi.update(id, { reminder_disabled: !!disabled }); toast.success(disabled ? "Hatırlatıcı kapatıldı" : "Hatırlatıcı aktif"); load(); }
    catch { toast.error("Değiştirilemedi"); }
  };
  const setTaskDigestMuted = async (id, muted) => {
    try { await tasksApi.update(id, { digest_muted: !!muted }); toast.success(muted ? "Sabah özetinden çıkarıldı" : "Sabah özetine eklendi"); load(); }
    catch { toast.error("Değiştirilemedi"); }
  };
  const setTaskPin = async (taskId, pinned, number) => {
    if (pinned && number != null) {
      const dup = tasks.find((t) => t.id !== taskId && t.status !== "done" && t.number_pinned && t.pinned_number === number);
      if (dup) { toast.error(`${number} numarası zaten "${dup.title}" görevine sabit`); return; }
    }
    try { await tasksApi.update(taskId, { number_pinned: pinned, pinned_number: pinned ? number : null }); toast.success(pinned ? `Sıra numarası sabitlendi: ${number}` : "Sabit kaldırıldı"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "İşlem başarısız"); }
  };
  const setReminder = async (id, iso, opts = {}) => {
    try { await tasksApi.setReminder(id, iso, opts); load(); toast.success("Hatırlatma kuruldu"); }
    catch { toast.error("Hatırlatma kurulamadı"); }
  };
  const clearReminder = async (id) => {
    try { await tasksApi.setReminder(id, null); load(); toast.success("Hatırlatma iptal edildi"); }
    catch { toast.error("İptal edilemedi"); }
  };
  const reassignTask = async (id, newOwnerId) => { await tasksApi.reassign(id, newOwnerId); load(); };
  const transferTaskToCompany = async (id, companyId) => { await tasksApi.transferToCompany(id, companyId); load(); };
  const demoteToSubtask = async (id) => {
    try { await tasksApi.demoteToSubtask(id); toast.success("Alt göreve dönüştürüldü"); } catch (e) { toast.error(e?.response?.data?.detail || "Dönüştürülemedi"); }
    load();
  };
  const removeFromGroup = async (gid, tid) => {
    try { await tasksApi.removeGroupMember(gid, tid); toast.success("Görev gruptan çıkarıldı"); load(); } catch { toast.error("Çıkarılamadı"); }
  };
  const saveEdit = async (patch) => {
    try { await tasksApi.update(editing.id, patch); load(); toast.success("Kaydedildi"); } catch { toast.error("Kaydedilemedi"); }
  };
  const issueOtp = async (task) => {
    try { const res = await taskLockApi.issueOtp(task.id); setOtpDisplay({ task, ...res }); }
    catch (e) { toast.error(e?.response?.data?.detail || "OTP üretilemedi"); }
  };

  // ContextMenu onAction — TaskCard.handleAction ile birebir.
  const handleAction = (task, action, extra) => {
    if (action === "delete") removeTask(task.id, task.title);
    else if (action === "edit") setEditing(task);
    else if (action === "share") setSharing(task);
    else if (action === "archive") setArchived(task.id, true);
    else if (action === "unarchive") setArchived(task.id, false);
    else if (action === "cancel-task") cancelTask(task.id, task.title);
    else if (action === "reset-size") { /* Kolay kartları sabit boyut — noop */ }
    else if (action === "reminder-cancel") clearReminder(task.id);
    else if (action === "link-tasks") setLinkModal({ mode: "create", taskId: task.id });
    else if (action === "group-edit") { if (task.group_id) setLinkModal({ mode: "edit", groupId: task.group_id }); }
    else if (action === "group-remove") { if (task.group_id) removeFromGroup(task.group_id, task.id); }
    else if (action === "demote-to-subtask") demoteToSubtask(task.id);
    else if (action === "digest-mute-toggle") setTaskDigestMuted(task.id, !task.digest_muted);
    else if (action.startsWith("export-")) {
      const catMap = Object.fromEntries((cats || []).map((c) => [c.id, c.name]));
      (async () => {
        try {
          if (action === "export-print") printTasks(task, catMap);
          else if (action === "export-excel") exportTasksExcel(task, catMap);
          else if (action === "export-word") await exportTasksWord(task, catMap);
        } catch (e) {
          toast.error(e?.message === "popup-blocked" ? "Açılır pencere engellendi" : "Dışa aktarılamadı");
        }
      })();
    } else if (action.startsWith("reminder-")) {
      const repeat = Math.max(1, extra?.repeat || 1);
      const opts = repeat > 1 ? { intervalMin: extra.intervalMin, repeatLeft: repeat, repeatTotal: repeat } : {};
      if (action === "reminder-custom") setReminder(task.id, extra.iso, opts);
      else setReminder(task.id, new Date(Date.now() + extra.offset).toISOString(), opts);
    } else {
      setStatus(task.id, action); // done / paused / pending / overdue
    }
  };

  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = activeTasks.findIndex((t) => t.id === active.id);
    const newIndex = activeTasks.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(activeTasks, oldIndex, newIndex);
    setTasks((prev) => {
      const activeIds = new Set(next.map((t) => t.id));
      const rest = prev.filter((t) => !activeIds.has(t.id));
      return [...next, ...rest];
    });
    tasksApi.reorder(next.map((t) => t.id)).catch(() => {});
  };

  const openMenu = (task, rect) => {
    setCtxMenu({ task, x: rect.left - 200, y: rect.bottom + 4 });
  };

  const linkCandidates = useMemo(() => {
    if (!linkModal) return { candidates: [], preselected: [], group: null };
    const ungrouped = tasks.filter((t) => !t.group_id && !t.archived && !t.deleted);
    if (linkModal.mode === "edit" && linkModal.groupId) {
      const members = tasks.filter((t) => t.group_id === linkModal.groupId);
      return { candidates: [...members, ...ungrouped], preselected: members.map((t) => t.id), group: groupById[linkModal.groupId] || null };
    }
    return { candidates: ungrouped, preselected: linkModal.taskId ? [linkModal.taskId] : [], group: null };
  }, [linkModal, tasks, groupById]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return "İyi geceler";
    if (h < 12) return "Günaydın";
    if (h < 18) return "İyi günler";
    return "İyi akşamlar";
  })();
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  const MENU = [
    { key: "home", label: "Ana Sayfa", icon: Home, onClick: () => setActiveKey("home") },
    { key: "tasks", label: "Görevler", icon: ListTodo, onClick: () => setActiveKey("tasks") },
    ...(teamFeaturesVisible ? [{ key: "team", label: "Ekip", icon: Users, onClick: () => { setActiveKey("team"); onOpenSection?.("team"); } }] : []),
    { key: "notes", label: "Notlar", icon: StickyNote, onClick: () => { setActiveKey("notes"); onOpenSection?.("notes"); } },
    { key: "files", label: "Dosyalar", icon: FolderOpen, onClick: () => { setActiveKey("files"); onOpenSection?.("files"); } },
    { key: "settings", label: "Ayarlar", icon: SettingsIcon, onClick: () => onOpenSettings?.() },
  ];

  const ctxTask = ctxMenu?.task;

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
            const active = m.key === activeKey;
            return (
              <button
                key={m.key}
                type="button"
                onClick={m.onClick}
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

        {/* İçerik — tam genişlik (max-w yok); sidebar açılınca right:360 ile daralır. */}
        <div className="flex-1 min-w-0 p-5 lg:p-8">
          <div className="mb-5">
            <div className="hud-text text-sertex-textMuted">{today}</div>
            <h1 className="display-text text-2xl lg:text-3xl text-sertex-cyan neon-glow mt-1">
              {greeting}, {user?.username || "Kullanıcı"}!
            </h1>
          </div>

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
              onClick={() => setShowAdd(true)}
              data-testid="kolay-add-task"
              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sertex-cyan/15 border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/25 transition-colors font-mono text-sm neon-glow"
            >
              <Plus className="h-4 w-4" /> Yeni Görev Ekle
            </button>
          </div>

          {flatCats.length > 0 && (
            <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-sertex pb-1" data-testid="kolay-cat-filter">
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
            <div className="hud-text text-sertex-textMuted py-10 text-center" data-testid="kolay-loading">YÜKLENİYOR...</div>
          ) : activeTasks.length === 0 ? (
            <div className="glass-panel corner-bracket rounded-xl p-8 text-center" data-testid="kolay-empty">
              <div className="text-sertex-text text-lg mb-1">🎉 Aktif görevin yok</div>
              <div className="hud-text text-sertex-textMuted normal-case mb-4">
                {q || catFilter ? "Eşleşen görev bulunamadı." : "Yeni bir görev ekleyerek başla."}
              </div>
              {!q && !catFilter && (
                <button type="button" onClick={() => setShowAdd(true)} data-testid="kolay-empty-add" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/10 font-mono text-sm">
                  <Plus className="h-4 w-4" /> Görev Ekle
                </button>
              )}
            </div>
          ) : canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={activeTasks.map((t) => t.id)} strategy={rectSortingStrategy}>
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
                  data-testid="kolay-task-grid"
                >
                  {activeTasks.map((t) => (
                    <KolaySortableCard key={t.id} task={t} number={numberOf[t.id]} catName={catName} onComplete={completeTask} onMenu={openMenu} collapsed={collapsedIds.has(t.id)} onToggleCollapse={toggleCollapse} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }} data-testid="kolay-task-grid">
              {activeTasks.map((t) => (
                <KolayCardBody key={t.id} task={t} number={numberOf[t.id]} catName={catName} onComplete={completeTask} onMenu={openMenu} collapsed={collapsedIds.has(t.id)} onToggleCollapse={toggleCollapse} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TAM Neural Link ⋮ menüsü (gerçek ContextMenu bileşeni) */}
      {ctxMenu && ctxTask && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          task={ctxTask}
          onAction={(action, extra) => handleAction(ctxTask, action, extra)}
          onClose={closeMenu}
          isTeamView={false}
          onReassign={() => setReassigning(ctxTask)}
          categories={cats}
          onSetCategory={(catId) => setTaskCategory(ctxTask.id, catId)}
          onSetReminderDays={(d) => setTaskReminderDays(ctxTask.id, d)}
          onSetReminderDisabled={(v) => setTaskReminderDisabled(ctxTask.id, v)}
          currentUser={user}
          onOpenLockConfig={() => setLockConfig(ctxTask)}
          onOpenUnlockOtp={() => setUnlockOtp(ctxTask)}
          onIssueOtp={() => issueOtp(ctxTask)}
          displayNumber={numberOf[ctxTask.id]}
          onPinNumber={(n) => setTaskPin(ctxTask.id, true, n)}
          onUnpinNumber={() => setTaskPin(ctxTask.id, false)}
          archiveGroup={null}
          isAdmin={false}
        />
      )}

      {/* Modallar — Neural Link ile aynı bileşenler */}
      {editing && (
        <EditTaskModal task={editing} onClose={() => setEditing(null)} onSave={saveEdit} isTeamView={false} categories={cats} teamMembers={[]} currentUser={user} />
      )}
      {sharing && (
        <ShareTaskModal task={sharing} onClose={() => setSharing(null)} onSaved={() => { setSharing(null); load(); }} />
      )}
      {reassigning && (
        <ReassignModal task={reassigning} onClose={() => setReassigning(null)} onSave={(uid) => reassignTask(reassigning.id, uid)} onTransferCompany={(cid) => transferTaskToCompany(reassigning.id, cid)} />
      )}
      {lockConfig && (
        <LockConfigModal task={lockConfig} onClose={() => setLockConfig(null)} onSaved={() => { setLockConfig(null); load(); }} />
      )}
      {unlockOtp && (
        <UnlockOtpModal task={unlockOtp} onClose={() => setUnlockOtp(null)} onVerified={() => { setUnlockOtp(null); load(); }} />
      )}
      {otpDisplay && (
        <OtpDisplayModal task={otpDisplay.task} code={otpDisplay.code} expiresAt={otpDisplay.expires_at} ttlMinutes={otpDisplay.ttl_minutes} onClose={() => setOtpDisplay(null)} />
      )}
      {linkModal && (
        <LinkTasksModal candidateTasks={linkCandidates.candidates} preselectedIds={linkCandidates.preselected} group={linkCandidates.group} onClose={() => setLinkModal(null)} onSaved={() => { setLinkModal(null); load(); }} />
      )}
      {showAdd && (
        <KolayAddModal cats={cats} onClose={() => setShowAdd(false)} onCreated={load} />
      )}
    </div>
  );
};

export default KolayInterface;

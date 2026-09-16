// Ortak görev-aksiyon kancası — Teknik ve Aydınlık arayüzlerinin tam görev
// kartı (TaskCard) gücüne kavuşması için TasksPanel/Kolay'daki handler setini
// tek yerde toplar. Detaylı / Kolay / Profesyonel'e DOKUNMAZ; onlar kendi
// mevcut mantıklarını kullanmaya devam eder.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { tasksApi, taskLockApi, reminderConfigApi } from "./api";
import { confirmDialog, choiceDialog } from "./confirm";
import { isOverdue } from "./taskHelpers";
import {
  useTaskClipboard,
  clearTaskClipboard,
  setTaskClipboard,
} from "./taskClipboard";
import { EditTaskModal } from "../components/tasks/EditTaskModal";
import { LinkTasksModal } from "../components/tasks/LinkTasksModal";
import { Link2, RotateCcw, Trash2 } from "lucide-react";
import { groupColorOf, hexToRgba } from "./groupColors";
import { useTaskSmartDelete } from "./taskSmartDelete";

export function useTaskActions({ tasks = [], setTasks, cats = [], groups = [], user, load, numberFor, highlight = "" }) {
  const clipboard = useTaskClipboard();
  const [editing, setEditing] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [reminderConfig, setReminderConfig] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [nudgeCounts, setNudgeCounts] = useState({});

  useEffect(() => {
    reminderConfigApi.get().then(setReminderConfig).catch(() => setReminderConfig(null));
  }, []);

  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const refresh = useCallback(() => { load?.(); }, [load]);
  const smartDelete = useTaskSmartDelete({ refresh });
  const numberFn = numberFor || (() => null);
  const catName = (id) => cats.find((c) => c.id === id)?.name || null;
  const groupById = useMemo(() => Object.fromEntries((groups || []).map((g) => [g.id, g])), [groups]);

  // ---- Aksiyonlar (tasksApi + reload) — TasksPanel ile birebir davranış ----
  const setStatus = async (id, status) => {
    try {
      await tasksApi.setStatus(id, status);
      if (setTasks) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
      else refresh();
      if (status === "done") toast.success("Görev tamamlandı");
    } catch { toast.error("Güncellenemedi"); }
  };

  const removeTask = async (id) => {
    const t = tasks.find((x) => x.id === id);
    if (smartDelete.requestDelete(t)) return; // alt görevi var → akıllı silme diyaloğu
    const ok = await confirmDialog({ title: "GÖREVİ SİL", message: `"${t?.title || "Görev"}" çöp kutusuna taşınsın mı?`, confirmText: "SİL", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { await tasksApi.delete(id); refresh(); toast.success("Çöp kutusuna taşındı"); }
    catch (e) { toast.error(e?.response?.status === 423 ? (e.response.data?.detail || "Görev kilitli") : "Silinemedi"); }
  };

  const setArchived = async (id, archived) => {
    if (setTasks) setTasks((prev) => prev.filter((t) => t.id !== id));
    toast.success(archived ? "Görev arşivlendi" : "Arşivden çıkarıldı");
    try { await tasksApi.setArchived(id, archived); } catch { toast.error("İşlem başarısız — geri alınıyor"); refresh(); }
  };

  const cancelTask = async (id) => {
    const t = tasks.find((x) => x.id === id);
    const ok = await confirmDialog({ title: "GÖREVİ İPTAL ET", message: `"${t?.title || "Görev"}" iptal edilsin mi?\nArşivin İPTAL grubuna taşınır.`, confirmText: "İPTAL ET", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { await tasksApi.cancel(id); refresh(); toast.success("Görev iptal edildi"); }
    catch (e) { toast.error(e?.response?.status === 423 ? (e.response.data?.detail || "Görev kilitli") : "İptal başarısız"); }
  };

  const setTaskCategory = async (id, categoryId) => {
    try {
      await tasksApi.update(id, { category_id: categoryId || "" });
      toast.success(`Görev → ${categoryId ? (catName(categoryId) || "İş Kolu") : "Kolsuz"}`);
      refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Değiştirilemedi"); }
  };

  const setTaskPin = async (taskId, pinned, number) => {
    if (pinned && number != null) {
      const dup = tasks.find((t) => t.id !== taskId && t.status !== "done" && t.number_pinned && t.pinned_number === number);
      if (dup) { toast.error(`${number} numarası zaten "${dup.title}" görevine sabit`); return; }
    }
    try { await tasksApi.update(taskId, { number_pinned: pinned, pinned_number: pinned ? number : null }); toast.success(pinned ? `Sıra numarası sabitlendi: ${number}` : "Sabit kaldırıldı"); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "İşlem başarısız"); }
  };

  const setReminder = async (id, iso, opts = {}) => {
    try { await tasksApi.setReminder(id, iso, opts); refresh(); toast.success("Hatırlatma kuruldu"); }
    catch { toast.error("Hatırlatma kurulamadı"); }
  };
  const clearReminder = async (id) => {
    try { await tasksApi.setReminder(id, null); refresh(); toast.success("Hatırlatma iptal edildi"); }
    catch { toast.error("İptal edilemedi"); }
  };
  const setTaskReminderDays = async (id, days) => {
    try { await tasksApi.update(id, { reminder_days: days == null ? 0 : days, reminder_disabled: false }); toast.success(days == null ? "Uyarı: varsayılan" : `Uyarı: ${days} gün önce`); refresh(); }
    catch { toast.error("Değiştirilemedi"); }
  };
  const setTaskReminderDisabled = async (id, disabled) => {
    try { await tasksApi.update(id, { reminder_disabled: !!disabled }); toast.success(disabled ? "Hatırlatıcı kapatıldı" : "Hatırlatıcı aktif"); refresh(); }
    catch { toast.error("Değiştirilemedi"); }
  };
  const setTaskDigestMuted = async (id, muted) => {
    try { await tasksApi.update(id, { digest_muted: !!muted }); toast.success(muted ? "Sabah özetinden çıkarıldı" : "Sabah özetine eklendi"); refresh(); }
    catch { toast.error("Değiştirilemedi"); }
  };

  // Alt görevler — task-scoped optimistic (başarısızlıkta sadece o görev geri alınır).
  const setSubtasks = async (id, subtasks) => {
    let prevSubtasks;
    if (setTasks) {
      setTasks((prev) => prev.map((t) => {
        if (t.id !== id) return t;
        if (prevSubtasks === undefined) prevSubtasks = t.subtasks;
        return { ...t, subtasks };
      }));
    }
    try { await tasksApi.setSubtasks(id, subtasks); }
    catch {
      toast.error("Alt görev kaydedilemedi");
      if (setTasks) setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, subtasks: prevSubtasks } : t)));
      else refresh();
    }
  };

  const promoteSubtask = async (taskId, subId, moveChildIds = null) => {
    try { const created = await tasksApi.promoteSubtask(taskId, subId, moveChildIds); toast.success(`Alt görev göreve dönüştürüldü: ${created?.title || ""}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Göreve dönüştürülemedi"); }
    refresh();
  };
  const demoteToSubtask = async (taskId) => {
    try { await tasksApi.demoteToSubtask(taskId); toast.success("Alt göreve dönüştürüldü"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Alt göreve dönüştürülemedi"); }
    refresh();
  };

  const reassignTask = async (id, newOwnerId) => { await tasksApi.reassign(id, newOwnerId); refresh(); };
  const transferTaskToCompany = async (id, companyId) => { await tasksApi.transferToCompany(id, companyId); refresh(); };
  const removeFromGroup = async (gid, tid) => {
    try { await tasksApi.removeGroupMember(gid, tid); toast.success("Görev gruptan çıkarıldı"); refresh(); } catch { toast.error("Çıkarılamadı"); }
  };
  const saveEdit = async (patch) => {
    try { await tasksApi.update(editing.id, patch); refresh(); toast.success("Kaydedildi"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Kaydedilemedi"); throw e; }
  };
  const copyTaskToClipboard = (t) => {
    setTaskClipboard({ sourceId: t.id, title: t.title, includeSubtasks: (t.subtasks || []).length > 0, includeAttachments: true });
    toast.success(`Panoya kopyalandı: ${t.title} — bir iş koluna Yapıştır'ı seçin.`);
  };

  const nudge = async (id, message = "") => {
    try {
      const r = await tasksApi.nudge(id, message);
      const n = r?.count_today || 0;
      if (n > 0) setNudgeCounts((m) => ({ ...m, [id]: n }));
      toast.success(n > 1 ? `Hatırlatma gönderildi · bugün ${n}. kez` : "Dürtme gönderildi");
    } catch (e) {
      const s = e?.response?.status;
      if (s === 429) toast.warning(e?.response?.data?.detail || "Çok sık — biraz sonra tekrar deneyin");
      else toast.error(e?.response?.data?.detail || "Dürtülemedi");
    }
  };
  const uncancelTask = async (id) => {
    try { await tasksApi.uncancel(id); toast.success("İptal geri alındı"); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Geri alınamadı"); }
  };
  const restoreTask = async (id) => {
    try { await tasksApi.restore(id); toast.success("Görev geri yüklendi"); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Geri yüklenemedi"); }
  };
  const permanentDeleteTask = async (id) => {
    const t = tasks.find((x) => x.id === id);
    const ok = await confirmDialog({ title: "KALICI SİL", message: `"${t?.title || "Görev"}" KALICI olarak silinsin mi? Bu işlem geri alınamaz.`, confirmText: "KALICI SİL", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { await tasksApi.permanentDelete(id); toast.success("Kalıcı olarak silindi"); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Silinemedi"); }
  };
  // Çöp'te grup görevlerini toplu geri getir / kalıcı sil — sor/seç mantığıyla.
  const [trashGrp, setTrashGrp] = useState(null); // { members:[{id,title}], action:'restore'|'permanent', mode:'ask'|'select', checked:Set }
  const openTrashGroup = (members, action, onDone) => setTrashGrp({ members: members || [], action, mode: "ask", checked: new Set(), onDone });
  const applyTrashGroup = async (ids) => {
    const action = trashGrp?.action;
    const onDone = trashGrp?.onDone;
    setTrashGrp(null);
    const list = Array.from(ids || []);
    if (!list.length) return;
    try {
      for (const id of list) {
        if (action === "restore") await tasksApi.restore(id);
        else await tasksApi.permanentDelete(id);
      }
      toast.success(action === "restore" ? `${list.length} görev geri getirildi` : `${list.length} görev kalıcı silindi`);
      refresh();
      onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "İşlem başarısız"); }
  };
  // Çöp görünümünde grup banner'ı — 2+ üyesi çöpte olan her grup için toplu
  // "Grubu Getir" / "Grubu Sil" sunar. onDone: yerel liste yenileyici (Kolay).
  const groupTrashBanner = (trashTasks = [], onDone) => {
    const counts = {};
    for (const t of trashTasks) { const g = t.group_id && groupById[t.group_id] ? t.group_id : null; if (g) counts[g] = (counts[g] || 0) + 1; }
    const gids = Object.keys(counts).filter((g) => counts[g] >= 2);
    if (!gids.length) return null;
    return (
      <div className="mb-4 space-y-2" data-testid="trash-groups">
        <div className="hud-text text-sertex-cyan flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" /> ÇÖPTEKİ GRUPLAR</div>
        {gids.map((gid) => {
          const g = groupById[gid];
          const gc = groupColorOf(g);
          const members = trashTasks.filter((t) => t.group_id === gid).map((t) => ({ id: t.id, title: t.title }));
          return (
            <div key={gid} data-testid={`trash-group-banner-${gid}`} className="rounded-xl border border-sertex-cyan/30 bg-sertex-cyan/[0.05] px-4 py-2.5 flex items-center gap-2 flex-wrap" style={gc ? { borderColor: hexToRgba(gc, 0.5), background: hexToRgba(gc, 0.08) } : undefined}>
              <span className="h-3 w-3 rounded-full shrink-0" style={{ background: gc || "rgb(var(--sx-accent-rgb))" }} />
              <Link2 className="h-4 w-4 text-sertex-cyan shrink-0" style={gc ? { color: gc } : undefined} />
              <span className="text-sertex-text font-medium truncate flex-1 min-w-0">{g?.name || "Bağlı Görevler"}</span>
              <span className="hud-text text-sertex-textMuted tabular-nums whitespace-nowrap">{members.length} görev</span>
              <button type="button" onClick={() => openTrashGroup(members, "restore", onDone)} data-testid={`trash-group-restore-${gid}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10 text-xs font-mono transition-colors"><RotateCcw className="h-3 w-3" /> Grubu Getir</button>
              <button type="button" onClick={() => openTrashGroup(members, "permanent", onDone)} data-testid={`trash-group-perm-${gid}`} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 text-xs font-mono transition-colors"><Trash2 className="h-3 w-3" /> Grubu Sil</button>
            </div>
          );
        })}
      </div>
    );
  };
  const emptyTrash = async (scope = "mine") => {
    const ok = await confirmDialog({ title: "ÇÖPÜ BOŞALT", message: "Çöp kutusundaki tüm görevler KALICI silinsin mi? Bu işlem geri alınamaz.", confirmText: "BOŞALT", cancelText: "VAZGEÇ", danger: true });
    if (!ok) return;
    try { const r = await tasksApi.emptyTrash(scope); toast.success(`${r?.deleted ?? 0} görev kalıcı silindi`); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Boşaltılamadı"); }
  };
  const dissolveGroup = async (group) => {
    const gid = group?.id || group;
    const ok = await confirmDialog({ title: "GRUBU DAĞIT", message: "Bu grup dağıtılsın mı? Görevler bağımsız kalır.", confirmText: "DAĞIT", cancelText: "VAZGEÇ" });
    if (!ok) return;
    try { await tasksApi.deleteGroup(gid); toast.success("Grup dağıtıldı"); refresh(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Dağıtılamadı"); }
  };
  // Grubu düzenle — bağlı görev modalını "edit" modunda aç.
  const editGroup = (group) => {
    const gid = group?.id || group;
    if (gid) setLinkModal({ mode: "edit", groupId: gid });
  };
  // Grubu Çöz — kullanıcı "Anlık" (geri alınabilir) veya "Kalıcı" seçer.
  const dissolveGroupModed = async (group) => {
    const gid = group?.id || group;
    if (!gid) return;
    const g = groupById[gid] || (typeof group === "object" ? group : null);
    const memberIds = tasks.filter((t) => t.group_id === gid).map((t) => t.id);
    const mode = await choiceDialog({
      title: "GRUBU ÇÖZ",
      message: `"${g?.name || "Bağlı Görevler"}" grubu nasıl çözülsün?\nGörevler silinmez; yalnızca bağlantıları kaldırılır.`,
      choices: [
        { value: "temporary", label: "ANLIK ÇÖZ (GERİ ALINABİLİR)", testid: "group-dissolve-temporary" },
        { value: "permanent", label: "KALICI ÇÖZ", danger: true, testid: "group-dissolve-permanent" },
      ],
      cancelText: "VAZGEÇ",
    });
    if (!mode) return;
    if (mode === "permanent") {
      try { await tasksApi.deleteGroup(gid); toast.success("Grup kalıcı çözüldü"); refresh(); }
      catch (e) { toast.error(e?.response?.data?.detail || "Çözülemedi"); }
      return;
    }
    // Anlık (geçici) — hemen çöz, 12 sn boyunca "Geri Al" sun.
    const snapshot = { name: g?.name || "", color: g?.color || null, show_progress: g?.show_progress !== false, task_ids: memberIds };
    try {
      await tasksApi.deleteGroup(gid);
      refresh();
      toast.success("Grup çözüldü", {
        description: "Yanlışlıkla mı oldu? Geri alabilirsin.",
        duration: 12000,
        action: {
          label: "Geri Al",
          onClick: async () => {
            try { await tasksApi.createGroup(snapshot); toast.success("Grup geri yüklendi"); refresh(); }
            catch { toast.error("Geri alınamadı"); }
          },
        },
      });
    } catch (e) { toast.error(e?.response?.data?.detail || "Çözülemedi"); }
  };
  const handlePaste = async (categoryId, categoryName) => {
    if (!clipboard?.sourceId) return;
    try {
      await tasksApi.duplicate(clipboard.sourceId, {
        include_subtasks: !!clipboard.includeSubtasks,
        include_attachments: !!clipboard.includeAttachments,
        category_id: categoryId || null,
      });
      toast.success(`Yapıştırıldı → ${categoryName || "Kolsuz"}`); refresh();
    } catch (e) { toast.error(e?.response?.data?.detail || "Yapıştırılamadı"); }
  };
  const handleUseTemplate = (task) => { refresh(); if (task) setEditing(task); };

  // İç içe promote için görsel liste (promoted_from_task_id ile).
  const promotedChildrenMap = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      const pid = t.promoted_from_task_id;
      if (!pid) continue;
      const bucket = isOverdue(t) ? "gecti" : t.status === "done" ? "bitti" : t.status === "paused" ? "bekliyor" : "aktif";
      (map[pid] = map[pid] || []).push({ ...t, __bucket: bucket });
    }
    return map;
  }, [tasks]);

  const linkCandidates = useMemo(() => {
    if (!linkModal) return { candidates: [], preselected: [], group: null };
    const ungrouped = tasks.filter((t) => !t.group_id && !t.archived && !t.deleted);
    if (linkModal.mode === "edit" && linkModal.groupId) {
      const members = tasks.filter((t) => t.group_id === linkModal.groupId);
      return { candidates: [...members, ...ungrouped], preselected: members.map((t) => t.id), group: groupById[linkModal.groupId] || null };
    }
    return { candidates: ungrouped, preselected: linkModal.taskId ? [linkModal.taskId] : [], group: null };
  }, [linkModal, tasks, groupById]);

  const cardPropsFor = (t) => ({
    task: t,
    displayNumber: numberFn(t.id),
    collapsed: collapsedIds.has(t.id),
    onToggleCollapse: () => toggleCollapse(t.id),
    onStatusChange: (status) => setStatus(t.id, status),
    onDelete: () => removeTask(t.id),
    onEdit: () => setEditing(t),
    onCopy: () => copyTaskToClipboard(t),
    onSetReminder: (iso, opts) => setReminder(t.id, iso, opts),
    onClearReminder: () => clearReminder(t.id),
    onSetSubtasks: (subs) => setSubtasks(t.id, subs),
    onSetArchived: (v) => setArchived(t.id, v),
    onReassign: (uid) => reassignTask(t.id, uid),
    onTransferCompany: (cid) => transferTaskToCompany(t.id, cid),
    onPromoteSubtask: (subId, moveChildIds) => promoteSubtask(t.id, subId, moveChildIds),
    onDemoteToSubtask: () => demoteToSubtask(t.id),
    onDemoteChild: (childId) => demoteToSubtask(childId),
    onPinNumber: (number) => setTaskPin(t.id, true, number),
    onUnpinNumber: () => setTaskPin(t.id, false, null),
    promotedChildren: promotedChildrenMap[t.id] || [],
    highlight,
    isTeamView: false,
    categoryName: catName(t.category_id),
    categories: cats,
    onSetCategory: (cid) => setTaskCategory(t.id, cid),
    reminderConfig,
    onSetReminderDays: (d) => setTaskReminderDays(t.id, d),
    onSetReminderDisabled: (v) => setTaskReminderDisabled(t.id, v),
    onToggleDigestMute: (v) => setTaskDigestMuted(t.id, v),
    currentUser: user,
    onLockChanged: () => refresh(),
    onLinkTasks: () => setLinkModal({ mode: "create", taskId: t.id }),
    onEditGroup: () => t.group_id && setLinkModal({ mode: "edit", groupId: t.group_id }),
    onRemoveFromGroup: () => t.group_id && removeFromGroup(t.group_id, t.id),
    onNudge: () => nudge(t.id),
    nudgeCount: nudgeCounts[t.id] || 0,
    archiveGroup: null,
    canPermanentDelete: false,
    onCancel: () => cancelTask(t.id),
  });

  const modalsElement = (
    <>
      {smartDelete.dialogElement}
      {editing && (
        <EditTaskModal task={editing} onClose={() => setEditing(null)} onSave={saveEdit} isTeamView={false} categories={cats} teamMembers={[]} currentUser={user} />
      )}
      {linkModal && (
        <LinkTasksModal candidateTasks={linkCandidates.candidates} preselectedIds={linkCandidates.preselected} group={linkCandidates.group} onClose={() => setLinkModal(null)} onSaved={() => { setLinkModal(null); refresh(); }} />
      )}
      {trashGrp && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setTrashGrp(null)} data-testid="trash-group-dialog">
          <div className={`w-[min(440px,92vw)] max-h-[80vh] overflow-y-auto scrollbar-sertex rounded-lg border ${trashGrp.action === "permanent" ? "border-rose-400/40" : "border-sertex-cyan/40"} bg-sertex-surface p-4 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center gap-2 mb-3 font-mono ${trashGrp.action === "permanent" ? "text-rose-300" : "text-sertex-cyan"}`}>
              {trashGrp.action === "permanent" ? "GRUBU KALICI SİL" : "GRUBU GERİ GETİR"}
            </div>
            {trashGrp.mode === "ask" ? (
              <>
                <div className="text-xs text-sertex-textMuted mb-4">Çöpteki <span className="text-sertex-text font-semibold">{trashGrp.members.length}</span> grup görevi {trashGrp.action === "permanent" ? "kalıcı silinecek" : "geri getirilecek"}. Nasıl?</div>
                <div className="space-y-2">
                  <button onClick={() => applyTrashGroup(trashGrp.members.map((m) => m.id))} data-testid="trash-group-all" className={`w-full text-left px-3 py-2 rounded-md border hud-text transition-colors ${trashGrp.action === "permanent" ? "border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "border-sertex-cyan/50 bg-sertex-cyan/10 text-sertex-cyan hover:bg-sertex-cyan/20"}`}>Hepsini ({trashGrp.members.length})</button>
                  <button onClick={() => setTrashGrp((p) => ({ ...p, mode: "select" }))} data-testid="trash-group-select-open" className="w-full text-left px-3 py-2 rounded-md border border-white/15 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40 hud-text transition-colors">Seçerek…</button>
                </div>
                <div className="flex justify-end mt-4"><button onClick={() => setTrashGrp(null)} data-testid="trash-group-cancel" className="hud-text px-3 py-1 rounded border border-white/15 text-sertex-textMuted hover:text-sertex-text">Vazgeç</button></div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="hud-text text-sertex-textMuted">{trashGrp.checked.size} seçili</span>
                  <button onClick={() => setTrashGrp((p) => ({ ...p, checked: p.checked.size === p.members.length ? new Set() : new Set(p.members.map((m) => m.id)) }))} data-testid="trash-group-toggle-all" className="hud-text px-2 py-0.5 rounded border border-sertex-cyan/30 text-sertex-cyan hover:bg-sertex-cyan/10">Tümünü Seç/Kaldır</button>
                </div>
                <div className="space-y-1 mb-4">
                  {trashGrp.members.map((m) => {
                    const on = trashGrp.checked.has(m.id);
                    return (
                      <button key={m.id} onClick={() => setTrashGrp((p) => { const n = new Set(p.checked); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return { ...p, checked: n }; })} data-testid={`trash-group-opt-${m.id}`} className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded border transition-colors ${on ? "border-sertex-cyan bg-sertex-cyan/15" : "border-white/10 hover:border-sertex-cyan/30"}`}>
                        <span className={`h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${on ? "border-sertex-cyan bg-sertex-cyan/50" : "border-sertex-cyan/40"}`}>{on && "✓"}</span>
                        <span className="flex-1 min-w-0 text-xs font-mono text-sertex-text truncate">{m.title}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => setTrashGrp((p) => ({ ...p, mode: "ask" }))} data-testid="trash-group-back" className="hud-text px-3 py-1 rounded border border-white/15 text-sertex-textMuted hover:text-sertex-text">← Geri</button>
                  <button disabled={trashGrp.checked.size === 0} onClick={() => applyTrashGroup(trashGrp.checked)} data-testid="trash-group-apply" className={`hud-text px-3 py-1 rounded border transition-colors ${trashGrp.checked.size === 0 ? "border-white/10 text-sertex-textMuted/40 cursor-not-allowed" : trashGrp.action === "permanent" ? "border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25" : "border-sertex-cyan/50 bg-sertex-cyan/10 text-sertex-cyan hover:bg-sertex-cyan/20"}`}>{trashGrp.action === "permanent" ? "Seçilenleri Sil" : "Seçilenleri Getir"} ({trashGrp.checked.size})</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );

  return { cardPropsFor, modalsElement, collapsedIds, toggleCollapse, reminderConfig, clipboard, clearTaskClipboard, setStatus, setArchived, removeTask, setTaskCategory, setEditing, nudge, cancelTask, uncancelTask, restoreTask, permanentDeleteTask, emptyTrash, dissolveGroup, dissolveGroupModed, editGroup, openTrashGroup, groupTrashBanner, groupById, handlePaste, handleUseTemplate };
}

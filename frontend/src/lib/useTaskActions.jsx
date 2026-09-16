// Ortak görev-aksiyon kancası — Teknik ve Aydınlık arayüzlerinin tam görev
// kartı (TaskCard) gücüne kavuşması için TasksPanel/Kolay'daki handler setini
// tek yerde toplar. Detaylı / Kolay / Profesyonel'e DOKUNMAZ; onlar kendi
// mevcut mantıklarını kullanmaya devam eder.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { tasksApi, taskLockApi, reminderConfigApi } from "./api";
import { confirmDialog } from "./confirm";
import { isOverdue } from "./taskHelpers";
import {
  useTaskClipboard,
  clearTaskClipboard,
  setTaskClipboard,
} from "./taskClipboard";
import { EditTaskModal } from "../components/tasks/EditTaskModal";
import { LinkTasksModal } from "../components/tasks/LinkTasksModal";

export function useTaskActions({ tasks = [], setTasks, cats = [], groups = [], user, load, numberFor, highlight = "" }) {
  const clipboard = useTaskClipboard();
  const [editing, setEditing] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [reminderConfig, setReminderConfig] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

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
    toast.success(`Panoya kopyalandı: ${t.title} — Detaylı/Kolay görünümde bir iş koluna Yapıştır'ı seçin.`);
  };

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
    archiveGroup: null,
    canPermanentDelete: false,
    onCancel: () => cancelTask(t.id),
  });

  const modalsElement = (
    <>
      {editing && (
        <EditTaskModal task={editing} onClose={() => setEditing(null)} onSave={saveEdit} isTeamView={false} categories={cats} teamMembers={[]} currentUser={user} />
      )}
      {linkModal && (
        <LinkTasksModal candidateTasks={linkCandidates.candidates} preselectedIds={linkCandidates.preselected} group={linkCandidates.group} onClose={() => setLinkModal(null)} onSaved={() => { setLinkModal(null); refresh(); }} />
      )}
    </>
  );

  return { cardPropsFor, modalsElement, collapsedIds, toggleCollapse, reminderConfig, clipboard, clearTaskClipboard, setStatus, setArchived, removeTask, setTaskCategory };
}

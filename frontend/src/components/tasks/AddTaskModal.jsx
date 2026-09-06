import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { tasksApi, teamApi, reminderConfigApi, taskAttachmentsApi } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { REMINDER_DAY_CHOICES } from "../../lib/taskHelpers";
import { defaultRecurringValue, resolveRecurringReminder } from "../../lib/reminderUtils";
import { MultiAssigneeSelect } from "./MultiAssigneeSelect";
import { CompanyCombobox } from "./CompanyCombobox";
import { RecurringReminderFields } from "./RecurringReminderFields";
import { PendingAttachments } from "./PendingAttachments";
import CategorySelect from "./CategorySelect";
import { SerialDateFields } from "./SerialDateFields";

// Detaylı/Kolay ile aynı "Yeni Görev Ekle" formu. testPrefix ile
// her temanın kendi data-testid'leri korunur (kolay-add / prof-add).
export const AddTaskModal = ({ cats, onClose, onCreated, testPrefix = "add" }) => {
  const { isTeamView, user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAutoFilled, setCompanyAutoFilled] = useState(false);
  const [assigneeUserIds, setAssigneeUserIds] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [newCategoryId, setNewCategoryId] = useState("");
  const [newReminderDays, setNewReminderDays] = useState(null);
  const [newReminderDisabled, setNewReminderDisabled] = useState(false);
  const [newReminder, setNewReminder] = useState(defaultRecurringValue());
  const [reminderConfig, setReminderConfig] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [assignSerial, setAssignSerial] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isTeamView) teamApi.members().then(setTeamMembers).catch(() => setTeamMembers([]));
    reminderConfigApi.get().then(setReminderConfig).catch(() => setReminderConfig(null));
  }, [isTeamView]);

  const submit = async () => {
    if (!title.trim()) { toast.error("Başlık gerekli"); return; }
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      toast.error("Başlangıç tarihi bitiş tarihinden sonra olamaz");
      return;
    }
    setSaving(true);
    try {
      const ids = assigneeUserIds;
      const others = ids.filter((x) => x !== user?.id);
      const includesSelf = user?.id ? ids.includes(user.id) : false;
      const extras = {
        assignee_name: assigneeName.trim() || null,
        company_name: companyName.trim() || null,
      };
      if (ids.length === 0 || (ids.length === 1 && includesSelf)) {
        // kişisel görev
      } else if (others.length === 1 && !includesSelf) {
        extras.assignee_user_id = others[0];
      } else {
        extras.assignee_user_ids = ids;
      }
      if (newCategoryId) extras.category_id = newCategoryId;
      if (assignSerial) extras.assign_serial = true;
      if (showDate) extras.show_created_date = true;
      if (startDate) extras.start_date = new Date(startDate).toISOString();
      if (newReminderDisabled) extras.reminder_disabled = true;
      else if (newReminderDays != null) extras.reminder_days = newReminderDays;
      const rr = resolveRecurringReminder(newReminder);
      if (rr.error) { toast.error(rr.error); setSaving(false); return; }
      if (rr.reminder_at) {
        extras.reminder_interval_min = rr.reminder_interval_min;
        extras.reminder_repeat_total = rr.reminder_repeat_total;
        extras.reminder_repeat_left = rr.reminder_repeat_left;
      }
      const created = await tasksApi.create(
        title.trim(),
        description.trim(),
        dueDate ? new Date(dueDate).toISOString() : null,
        rr.reminder_at || null,
        extras,
      );
      if (created?.id && pendingFiles.length) {
        let okCount = 0;
        for (const f of pendingFiles) {
          try { await taskAttachmentsApi.upload(created.id, f); okCount += 1; }
          catch { toast.error(`Dosya yüklenemedi: ${f.name}`); }
        }
        if (okCount) toast.success(`${okCount} dosya göreve eklendi`);
      }
      toast.success("Görev eklendi");
      onCreated?.();
      onClose?.();
    } catch {
      toast.error("Görev eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  const defaultReminderLabel = reminderConfig?.effective
    ? `⏱ Uyarı: Varsayılan (${reminderConfig.effective} gün)`
    : "⏱ Uyarı: Varsayılan";

  const inputCls = "w-full px-3 py-2.5 rounded-lg bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text font-mono text-sm placeholder:text-sertex-textMuted focus:border-sertex-cyan outline-none";

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose} data-testid={`${testPrefix}-overlay`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-panel border border-sertex-cyan/40 rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-sertex"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testPrefix}-modal`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="display-text text-sertex-cyan neon-glow flex items-center gap-2"><Plus className="h-4 w-4" /> YENİ GÖREV</div>
          <button onClick={onClose} data-testid={`${testPrefix}-close`} className="text-sertex-textMuted hover:text-sertex-cyan"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            data-testid={`${testPrefix}-title`}
            placeholder="Görev başlığı"
            className={inputCls}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            data-testid={`${testPrefix}-desc`}
            rows={2}
            placeholder="Açıklama (opsiyonel)"
            className={`${inputCls} resize-none`}
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="hud-text text-sertex-textMuted mb-1">BAŞLANGIÇ</div>
              <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid={`${testPrefix}-start`} className={inputCls} />
            </div>
            <div>
              <div className="hud-text text-sertex-textMuted mb-1">BİTİŞ</div>
              <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid={`${testPrefix}-due`} className={inputCls} />
            </div>
          </div>
          {isTeamView && (
            <div className="space-y-2">
              {teamMembers.length > 0 ? (
                <MultiAssigneeSelect
                  members={teamMembers}
                  selfUser={user ? { id: user.id, username: user.username } : null}
                  selectedIds={assigneeUserIds}
                  companyFilter={companyName}
                  onChange={(newIds) => {
                    setAssigneeUserIds(newIds);
                    const others = newIds.filter((x) => x !== user?.id);
                    if (companyAutoFilled || !companyName.trim()) {
                      if (others.length === 1) {
                        setCompanyName(teamMembers.find((m) => m.id === others[0])?.company_name || "");
                        setCompanyAutoFilled(true);
                      } else if (newIds.length === 0) {
                        setCompanyName("");
                        setCompanyAutoFilled(true);
                      }
                    }
                  }}
                />
              ) : (
                <input
                  type="text"
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  placeholder="Görev sahibi (opsiyonel)"
                  data-testid={`${testPrefix}-assignee`}
                  className={inputCls}
                />
              )}
              <CompanyCombobox
                value={companyName}
                onChange={setCompanyName}
                onManualEdit={(isManual) => setCompanyAutoFilled(!isManual)}
                options={teamMembers.map((m) => m.company_name).filter(Boolean)}
                placeholder="Şirket (opsiyonel)"
                testId={`${testPrefix}-company`}
              />
            </div>
          )}
          <CategorySelect
            categories={cats}
            value={newCategoryId}
            onChange={setNewCategoryId}
            testId={`${testPrefix}-category`}
          />
          <select
            value={newReminderDisabled ? "__off__" : (newReminderDays == null ? "" : String(newReminderDays))}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__off__") { setNewReminderDisabled(true); setNewReminderDays(null); }
              else if (v === "") { setNewReminderDisabled(false); setNewReminderDays(null); }
              else { setNewReminderDisabled(false); setNewReminderDays(parseInt(v, 10)); }
            }}
            data-testid={`${testPrefix}-reminder-days`}
            className={inputCls}
          >
            <option value="">{defaultReminderLabel}</option>
            {REMINDER_DAY_CHOICES.map((d) => (
              <option key={d} value={d}>{`⏱ Uyarı: ${d} gün önce`}</option>
            ))}
            <option value="__off__">🚫 Bu görev için hatırlatıcı kapalı</option>
          </select>
          <RecurringReminderFields value={newReminder} onChange={setNewReminder} testPrefix={`${testPrefix}-reminder`} />
          <SerialDateFields
            testPrefix={testPrefix}
            assignSerial={assignSerial}
            setAssignSerial={setAssignSerial}
            showDate={showDate}
            setShowDate={setShowDate}
          />
          <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} data-testid={`${testPrefix}-cancel`} className="px-4 py-2 rounded-lg border border-sertex-textMuted/30 text-sertex-textMuted hover:text-sertex-text font-mono text-sm">İPTAL</button>
          <button onClick={submit} disabled={saving} data-testid={`${testPrefix}-submit`} className="px-4 py-2 rounded-lg bg-sertex-cyan/15 border border-sertex-cyan text-sertex-cyan hover:bg-sertex-cyan/25 font-mono text-sm neon-glow disabled:opacity-50">
            {saving ? "EKLENİYOR..." : "EKLE"}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default AddTaskModal;

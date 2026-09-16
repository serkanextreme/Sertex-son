// Ana görev için AKILLI SİLME — alt görev silmedeki (TaskCard) 3 seçenekli
// akışın birebir görev seviyesindeki karşılığı. Alt görevi OLAN bir görev
// silinirken sorar:
//   1) Hepsini Sil       → görev + tüm alt görevler çöpe
//   2) Sadece Görevi Sil → üst-seviye alt görevler bağımsız göreve dönüştürülür
//                          (promote, iç içe çocuklarıyla), sonra görev çöpe
//   3) Seçerek Sil       → işaretlenen alt görevler silinir; kalanlar bağımsız
//                          göreve dönüştürülür; sonra görev çöpe
// Hepsinde 12 sn "Geri Al" (mevcut uçlarla tam geri alma).
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Trash2, CornerLeftUp, ListChecks, ChevronRight, Check, CornerDownRight, X } from "lucide-react";
import { tasksApi } from "./api";
import { flattenSubs, flattenSubsDepth, mutateSelectedSubs } from "./subtaskTree";

export function useTaskSmartDelete({ refresh }) {
  const [target, setTarget] = useState(null); // { task }
  const [mode, setMode] = useState("ask"); // ask | select
  const [checked, setChecked] = useState(() => new Set());

  const close = () => setTarget(null);

  // Alt görevi varsa akıllı diyalogu aç; yoksa çağırana bırak (temaya özel
  // basit onay/sebep akışı). Dönüş: true = diyalog açıldı, false = alt görev yok.
  const requestDelete = (task) => {
    if (!task) return false;
    const subs = task.subtasks || [];
    if (!subs.length) return false;
    setTarget({ task });
    setMode("ask");
    setChecked(new Set());
    return true;
  };

  const withUndo = (label, undoFn) => {
    toast.success(label, {
      description: "Yanlışlıkla mı? Geri alabilirsin.",
      duration: 12000,
      action: {
        label: "Geri Al",
        onClick: async () => {
          try { await undoFn(); refresh?.(); toast.success("Geri alındı"); }
          catch { toast.error("Geri alınamadı"); }
        },
      },
    });
  };

  const runError = (e) => toast.error(e?.response?.status === 423 ? (e.response?.data?.detail || "Görev kilitli") : (e?.response?.data?.detail || "Silinemedi"));

  // 1) HEPSİNİ SİL — görev + gömülü alt görevler çöpe. Geri Al = restore.
  const doAll = async (task) => {
    close();
    try {
      await tasksApi.delete(task.id);
      refresh?.();
      withUndo("Görev çöpe taşındı", async () => { await tasksApi.restore(task.id); });
    } catch (e) { runError(e); }
  };

  // 2) SADECE GÖREVİ SİL — üst-seviye alt görevleri bağımsız göreve dönüştür,
  // sonra görevi çöpe at. Geri Al = dönüşenleri kalıcı sil + görevi geri yükle
  // + orijinal alt görev ağacını geri koy.
  const doKeep = async (task) => {
    close();
    const snapshotSubs = task.subtasks || [];
    const topIds = snapshotSubs.map((s) => s.id);
    const promotedIds = [];
    try {
      for (const sid of topIds) {
        const nt = await tasksApi.promoteSubtask(task.id, sid, null); // tüm çocuklar taşınır
        if (nt?.id) promotedIds.push(nt.id);
      }
      await tasksApi.delete(task.id);
      refresh?.();
      withUndo(`Görev silindi · ${topIds.length} alt görev bağımsız göreve dönüştürüldü`, async () => {
        for (const pid of promotedIds) {
          try { await tasksApi.delete(pid); } catch { /* zaten çöpte olabilir */ }
          try { await tasksApi.permanentDelete(pid); } catch { /* yoksay */ }
        }
        await tasksApi.restore(task.id);
        await tasksApi.setSubtasks(task.id, snapshotSubs);
      });
    } catch (e) { runError(e); refresh?.(); }
  };

  // 3) SEÇEREK SİL — işaretlenenler ağaçtan düşürülür (silinir); kalan üst-seviye
  // alt görevler bağımsız göreve dönüştürülür; görev çöpe. Geri Al = orijinali geri koy.
  const doSelect = async (task, checkedSet) => {
    close();
    const snapshotSubs = task.subtasks || [];
    const remaining = mutateSelectedSubs(snapshotSubs, checkedSet, () => null);
    const keptTopIds = remaining.map((s) => s.id);
    const promotedIds = [];
    try {
      await tasksApi.setSubtasks(task.id, remaining);
      for (const sid of keptTopIds) {
        const nt = await tasksApi.promoteSubtask(task.id, sid, null);
        if (nt?.id) promotedIds.push(nt.id);
      }
      await tasksApi.delete(task.id);
      refresh?.();
      withUndo(`Görev silindi · ${checkedSet.size} alt görev silindi, ${keptTopIds.length} korundu`, async () => {
        for (const pid of promotedIds) {
          try { await tasksApi.delete(pid); } catch { /* yoksay */ }
          try { await tasksApi.permanentDelete(pid); } catch { /* yoksay */ }
        }
        await tasksApi.restore(task.id);
        await tasksApi.setSubtasks(task.id, snapshotSubs);
      });
    } catch (e) { runError(e); refresh?.(); }
  };

  const dialogElement = target && createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
      data-testid="task-delete-dialog"
    >
      <div
        className="w-[min(460px,92vw)] max-h-[80vh] overflow-y-auto scrollbar-sertex rounded-lg border border-rose-400/40 bg-sertex-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-rose-300 font-mono"><Trash2 className="h-4 w-4" /> GÖREVİ SİL</div>
          <button onClick={close} data-testid="task-delete-close" className="text-sertex-textMuted hover:text-sertex-text"><X className="h-4 w-4" /></button>
        </div>
        {mode === "ask" ? (
          <>
            <div className="text-xs text-sertex-textMuted mb-4">
              <span className="text-sertex-text font-semibold">"{target.task.title}"</span> görevinin <span className="text-rose-300 font-semibold">{flattenSubs(target.task.subtasks || []).length}</span> alt görevi var. Nasıl silinsin?
            </div>
            <div className="space-y-2">
              <button
                onClick={() => doAll(target.task)}
                data-testid="task-delete-all"
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-md border border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 transition-colors"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span className="flex-1 min-w-0"><span className="hud-text block">Hepsini Sil</span><span className="text-[10px] font-mono text-rose-200/70 normal-case">Görev + {flattenSubs(target.task.subtasks || []).length} alt görev çöpe</span></span>
              </button>
              <button
                onClick={() => doKeep(target.task)}
                data-testid="task-delete-keep"
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-md border border-sertex-cyan/50 bg-sertex-cyan/10 text-sertex-cyan hover:bg-sertex-cyan/20 transition-colors"
              >
                <CornerLeftUp className="h-4 w-4 shrink-0" />
                <span className="flex-1 min-w-0"><span className="hud-text block">Sadece Görevi Sil</span><span className="text-[10px] font-mono text-sertex-cyan/70 normal-case">Alt görevler bağımsız göreve dönüştürülür, kaybolmaz</span></span>
              </button>
              <button
                onClick={() => { setMode("select"); setChecked(new Set()); }}
                data-testid="task-delete-select-open"
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-md border border-white/15 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40 transition-colors"
              >
                <ListChecks className="h-4 w-4 shrink-0" />
                <span className="flex-1 min-w-0"><span className="hud-text block">Seçerek Sil…</span><span className="text-[10px] font-mono text-sertex-textMuted normal-case">Silinecek alt görevleri seç; kalanlar korunur</span></span>
                <ChevronRight className="h-4 w-4 opacity-60 shrink-0" />
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={close} data-testid="task-delete-cancel" className="hud-text px-3 py-1 rounded border border-white/15 text-sertex-textMuted hover:text-sertex-text">Vazgeç</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs text-sertex-textMuted mb-2">Silinecek alt görevleri işaretle. Bir alt görevi seçince onun iç görevleri de silinir. İşaretlenmeyenler bağımsız göreve dönüştürülür.</div>
            <div className="flex items-center justify-between mb-2">
              <span className="hud-text text-sertex-textMuted">{checked.size} seçili</span>
              <button
                onClick={() => {
                  const all = flattenSubsDepth(target.task.subtasks || []).map((x) => x.node.id);
                  setChecked((prev) => (prev.size === all.length ? new Set() : new Set(all)));
                }}
                data-testid="task-delete-toggle-all"
                className="hud-text px-2 py-0.5 rounded border border-rose-400/30 text-rose-300 hover:bg-rose-500/10"
              >
                Tümünü Seç/Kaldır
              </button>
            </div>
            <div className="space-y-1 mb-4">
              {flattenSubsDepth(target.task.subtasks || []).map(({ node, depth }) => {
                const on = checked.has(node.id);
                return (
                  <button
                    key={node.id}
                    onClick={() => setChecked((prev) => { const n = new Set(prev); if (n.has(node.id)) n.delete(node.id); else n.add(node.id); return n; })}
                    data-testid={`task-delete-opt-${node.id}`}
                    style={{ paddingLeft: 8 + depth * 16 }}
                    className={`w-full flex items-center gap-2 text-left pr-2 py-1.5 rounded border transition-colors ${on ? "border-rose-400 bg-rose-500/15" : "border-white/10 hover:border-rose-400/30"}`}
                  >
                    <span className={`h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 ${on ? "border-rose-400 bg-rose-500/50" : "border-rose-400/40"}`}>
                      {on && <Check className="h-3 w-3 text-white" />}
                    </span>
                    {depth > 0 && <CornerDownRight className="h-3 w-3 text-sertex-textMuted shrink-0" />}
                    <span className="flex-1 min-w-0 text-xs font-mono text-sertex-text truncate">{node.text}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setMode("ask")} data-testid="task-delete-back" className="hud-text px-3 py-1 rounded border border-white/15 text-sertex-textMuted hover:text-sertex-text">← Geri</button>
              <button
                disabled={checked.size === 0}
                onClick={() => doSelect(target.task, checked)}
                data-testid="task-delete-selected"
                className={`hud-text px-3 py-1 rounded border transition-colors ${checked.size === 0 ? "border-white/10 text-sertex-textMuted/40 cursor-not-allowed" : "border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"}`}
              >
                Seçilenleri Sil ({checked.size})
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );

  return { requestDelete, dialogElement };
}

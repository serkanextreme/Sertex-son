// Ana görev ÇOKLU SEÇİM + toplu işlem hook'u. Üç arayüz de (Detaylı, Kolay,
// Profesyonel) bunu kullanır: seçim durumu + tek noktadan toplu yürütme.
//   const bulk = useTaskBulk({ numberFor: (id) => numById[id],
//                              refresh: () => { load(); notifyTasksChanged(); } });
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { confirmDialog } from "./confirm";
import { runBulkTaskAction } from "./taskBulkActions";

const LABELS = {
  done: "tamamlandı",
  paused: "beklemeye alındı",
  pending: "aktif yapıldı",
  overdue: "tarihi geçti işaretlendi",
  archive: "arşivlendi",
  pin: "sıra numarası sabitlendi",
  unpin: "sabiti kaldırıldı",
  move: "iş koluna taşındı",
  delete: "çöp kutusuna taşındı",
};

export function useTaskBulk({ numberFor, refresh } = {}) {
  const [selectMode, setSelectMode] = useState(false);
  const [ids, setIds] = useState([]);

  const has = useCallback((id) => ids.includes(id), [ids]);
  const toggle = useCallback(
    (id) => setIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    [],
  );
  const start = useCallback((id) => { setSelectMode(true); setIds(id != null ? [id] : []); }, []);
  const selectAll = useCallback((allIds) => setIds(allIds || []), []);
  const clear = useCallback(() => setIds([]), []);
  const exit = useCallback(() => { setSelectMode(false); setIds([]); }, []);

  const runAction = useCallback(
    async (action, extra) => {
      const targetIds = ids;
      if (!targetIds.length) return;
      if (action === "delete") {
        const ok = await confirmDialog({
          title: "TOPLU SİL",
          message: `${targetIds.length} görev çöp kutusuna taşınsın mı?`,
          confirmText: "SİL",
          cancelText: "VAZGEÇ",
          danger: true,
        });
        if (!ok) return;
      }
      const results = await runBulkTaskAction(targetIds, action, { numberFor, categoryId: extra?.categoryId });
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - okCount;
      if (refresh) refresh();
      exit();
      if (failCount) toast.error(`${okCount} göreve uygulandı · ${failCount} başarısız (kilitli olabilir)`);
      else toast.success(`${okCount} görev ${LABELS[action] || "güncellendi"}`);
    },
    [ids, numberFor, refresh, exit],
  );

  return { selectMode, ids, has, toggle, start, selectAll, clear, exit, runAction };
}

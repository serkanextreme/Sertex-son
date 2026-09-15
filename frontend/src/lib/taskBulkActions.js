// Ana görev TOPLU işlem yürütücüsü — seçili görev id'lerine mevcut tasksApi
// çağrılarını uygular. Her işlem backend'e tek tek gider (Promise.allSettled →
// biri kilitli/başarısız olsa da diğerleri uygulanır).
import { tasksApi } from "./api";

// action: done | paused | pending | overdue | archive | delete | pin | unpin
export async function runBulkTaskAction(ids, action, opts = {}) {
  const numberFor = opts.numberFor || (() => null);
  const calls = ids.map((id) => {
    switch (action) {
      case "done":
      case "paused":
      case "pending":
      case "overdue":
        return tasksApi.setStatus(id, action);
      case "archive":
        return tasksApi.setArchived(id, true);
      case "delete":
        return tasksApi.delete(id);
      case "unpin":
        return tasksApi.update(id, { number_pinned: false, pinned_number: null });
      case "pin": {
        const n = numberFor(id);
        return n == null
          ? Promise.resolve()
          : tasksApi.update(id, { number_pinned: true, pinned_number: n });
      }
      default:
        return Promise.resolve();
    }
  });
  return Promise.allSettled(calls);
}

// Görev sıra numaralarını hesapla (sabitlenenler atlanır) — TasksPanel'deki
// numById ile aynı mantık; sıra numarası olmayan arayüzler (Profesyonel) için.
export function computeTaskNumbers(orderedTasks) {
  const m = {};
  const reserved = new Set();
  for (const t of orderedTasks) {
    if (t.status !== "done" && t.number_pinned && t.pinned_number != null) reserved.add(t.pinned_number);
  }
  let c = 0;
  for (const t of orderedTasks) {
    if (t.status === "done") { m[t.id] = null; continue; }
    if (t.number_pinned && t.pinned_number != null) { m[t.id] = t.pinned_number; continue; }
    c += 1;
    while (reserved.has(c)) c += 1;
    m[t.id] = c;
  }
  return m;
}

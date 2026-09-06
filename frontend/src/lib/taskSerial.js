// Görev kalıcı Seri No + oluşturulma tarihi etiketi yardımcıları.
// Etiket: seri no ve/veya tarih. İkisi → "1-10.09.2026", tek → biri, yoksa "".

export function formatCreatedDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function taskSerialLabel(task) {
  if (!task) return "";
  const parts = [];
  if (task.serial != null) parts.push(String(task.serial));
  if (task.show_created_date && task.created_at) {
    const d = formatCreatedDate(task.created_at);
    if (d) parts.push(d);
  }
  return parts.join("-");
}

// Aramada bulunması için seri no'yu düz metin döndürür.
export function taskSerialSearchText(task) {
  return task && task.serial != null ? String(task.serial) : "";
}

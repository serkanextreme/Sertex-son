// İç içe (nested) alt görev ağacı yardımcıları — hepsi id bazlı ve immutable.
// Ağaç: her düğüm { id, text, done, status, due_date, ..., children: [] }.

export const flattenSubs = (nodes = []) => {
  const out = [];
  const walk = (arr) => {
    for (const s of arr || []) {
      out.push(s);
      if (Array.isArray(s.children) && s.children.length) walk(s.children);
    }
  };
  walk(nodes);
  return out;
};

export const updateSubById = (nodes = [], id, patch) =>
  nodes.map((s) => {
    if (s.id === id) return { ...s, ...patch };
    if (Array.isArray(s.children) && s.children.length)
      return { ...s, children: updateSubById(s.children, id, patch) };
    return s;
  });

export const removeSubById = (nodes = [], id) =>
  nodes
    .filter((s) => s.id !== id)
    .map((s) =>
      Array.isArray(s.children) && s.children.length
        ? { ...s, children: removeSubById(s.children, id) }
        : s,
    );

// parentId null/undefined → köke ekle.
export const addChildById = (nodes = [], parentId, child) => {
  if (parentId == null) return [...nodes, child];
  return nodes.map((s) => {
    if (s.id === parentId) return { ...s, children: [...(s.children || []), child] };
    if (Array.isArray(s.children) && s.children.length)
      return { ...s, children: addChildById(s.children, parentId, child) };
    return s;
  });
};

// Sürükle-sırala: parentId'nin çocuk dizisini yenisiyle değiştir (null → kök).
export const replaceChildrenById = (nodes = [], parentId, newChildren) => {
  if (parentId == null) return newChildren;
  return nodes.map((s) => {
    if (s.id === parentId) return { ...s, children: newChildren };
    if (Array.isArray(s.children) && s.children.length)
      return { ...s, children: replaceChildrenById(s.children, parentId, newChildren) };
    return s;
  });
};

export const findSubById = (nodes = [], id) => {
  for (const s of nodes) {
    if (s.id === id) return s;
    if (Array.isArray(s.children) && s.children.length) {
      const f = findSubById(s.children, id);
      if (f) return f;
    }
  }
  return null;
};

// Seçili id'lere mutator uygula; mutator null dönerse düğüm (ve alt ağacı) silinir.
export const mutateSelectedSubs = (nodes = [], selectedSet, mutator) => {
  const out = [];
  for (const s of nodes) {
    let node = s;
    if (Array.isArray(s.children) && s.children.length) {
      node = { ...s, children: mutateSelectedSubs(s.children, selectedSet, mutator) };
    }
    if (selectedSet.has(s.id)) {
      const r = mutator(node);
      if (r === null) continue;
      out.push(r);
    } else {
      out.push(node);
    }
  }
  return out;
};

// Sıra numaraları — her KARDEŞ grubu kendi içinde numaralanır (bitmiş atlanır,
// sabitlenenler korunur ve o numaralar atlanır). Görev listesiyle aynı mantık.
export const computeSubNumbers = (nodes = []) => {
  const map = {};
  const numberGroup = (arr) => {
    const reserved = new Set();
    for (const s of arr) {
      const done = s.done || s.status === "done";
      if (!done && s.number_pinned && s.pinned_number != null) reserved.add(s.pinned_number);
    }
    let c = 0;
    for (const s of arr) {
      const done = s.done || s.status === "done";
      if (done) map[s.id] = null;
      else if (s.number_pinned && s.pinned_number != null) map[s.id] = s.pinned_number;
      else {
        c += 1;
        while (reserved.has(c)) c += 1;
        map[s.id] = c;
      }
      if (Array.isArray(s.children) && s.children.length) numberGroup(s.children);
    }
  };
  numberGroup(nodes);
  return map;
};

// Toplu SABİTLE — seçili & bitmemiş düğümleri mevcut numaralarına sabitler.
export const pinSelectedSubs = (nodes = [], selectedSet, numbers) =>
  nodes.map((s) => {
    let node = s;
    if (Array.isArray(s.children) && s.children.length)
      node = { ...s, children: pinSelectedSubs(s.children, selectedSet, numbers) };
    if (selectedSet.has(s.id) && !(s.done || s.status === "done") && numbers[s.id] != null) {
      return { ...node, number_pinned: true, pinned_number: numbers[s.id] };
    }
    return node;
  });

// İstatistik: toplam ve tamamlanan (tüm derinlikler dahil).
export const subCounts = (nodes = []) => {
  const flat = flattenSubs(nodes);
  const done = flat.filter((s) => s.done || s.status === "done").length;
  return { total: flat.length, done };
};

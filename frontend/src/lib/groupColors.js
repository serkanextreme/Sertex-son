// Bağlı görev gruplarının renk kimliği — her gruba kendi rengi verilir; kartlarda
// ve grup başlıklarında bir bakışta hangi gruba ait olduğu anlaşılsın diye.
export const GROUP_COLORS = [
  { name: "Cyan", value: "#00F0FF" },
  { name: "Mor", value: "#B96BFF" },
  { name: "Yeşil", value: "#34D399" },
  { name: "Amber", value: "#FBBF24" },
  { name: "Mavi", value: "#5B8CFF" },
  { name: "Pembe", value: "#FF5C7A" },
  { name: "Turkuaz", value: "#2DD4BF" },
  { name: "Turuncu", value: "#FB923C" },
];

// Renk yoksa temanın vurgu rengini kullan (CSS değişkeni).
export const ACCENT_CSS = "rgb(var(--sx-accent-rgb))";

export const groupColorOf = (group) => {
  const c = group && group.color;
  return typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c) ? c : null;
};

export const groupColorOr = (group, fallback = ACCENT_CSS) => groupColorOf(group) || fallback;

export const hexToRgba = (hex, a) => {
  try {
    const h = String(hex).replace("#", "");
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  } catch { return `rgba(0,240,255,${a})`; }
};

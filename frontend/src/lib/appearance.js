import { useEffect, useState } from "react";

// Görünüm ayarları (cihaza özel, localStorage) — Ayarlar → Temalar → ARAYÜZ.
// 3 bağımsız eksen:
//   1) fontScale : kök rem ölçeği → tüm rem-tabanlı metin orantılı büyür/küçülür
//   2) accent    : vurgu rengi (hex) → <html> --sx-accent-rgb değişkenine yazılır;
//                  Tailwind `sertex-cyan` bu değişkeni okuduğu için TÜM arayüz
//                  tek noktadan renklenir (varsayılan cyan → hiçbir şey değişmez).
//   3) interface : arayüz düzeni ("detayli" varsayılan = mevcut zengin HUD).
const STORAGE_KEY = "sertex_appearance_v1";

export const DEFAULT_ACCENT = "#00F0FF";
export const DEFAULT_FONT_SCALE = "m"; // s | m | l | xl
export const DEFAULT_INTERFACE = "detayli";

// Vurgu rengi hazır paleti (uygulamanın ruhuna uygun canlı neon tonlar).
export const ACCENT_PRESETS = [
  { name: "Cyan", value: "#00F0FF" },
  { name: "Neon Yeşil", value: "#00FF88" },
  { name: "Elektrik Mavi", value: "#3B82F6" },
  { name: "Ametist", value: "#B96BFF" },
  { name: "Alev", value: "#FF7A18" },
  { name: "Kırmızı", value: "#FF3B5C" },
  { name: "Altın", value: "#FFC53D" },
  { name: "Pembe", value: "#FF4FD8" },
];

export const FONT_SCALES = [
  { key: "s", label: "Küçük", px: 15 },
  { key: "m", label: "Normal", px: 16 },
  { key: "l", label: "Büyük", px: 18 },
  { key: "xl", label: "Çok Büyük", px: 20 },
];

// Görev menüsü (sağ tık / ⋯) aksiyon renkleri — işlev tipine göre gruplanır ki
// hepsi tek tip cyan görünüp karışmasın. Kullanıcı her grubun rengini
// Ayarlar → Temalar → MENÜ RENKLERİ'nden değiştirebilir (cihaza özel).
export const DEFAULT_ACTION_COLORS = {
  success: "#34D399", // onay / tamamlama
  neutral: "#00F0FF", // genel / düzenleme
  warning: "#FBBF24", // uyarı / bekletme
  info: "#5B8CFF",    // taşıma / organizasyon
  special: "#B96BFF", // seçim / devir
  danger: "#FF5C7A",  // silme / iptal
};

export const ACTION_COLOR_GROUPS = [
  { key: "success", label: "Onay / Tamamlama", desc: "Tamamlandı · Geri Yükle · Kilidi Aç" },
  { key: "neutral", label: "Genel / Düzenleme", desc: "Düzenle · Kopyala · Aktif Yap · Arşivle" },
  { key: "warning", label: "Uyarı / Bekletme", desc: "Beklemeye Al · Tarihi Geçmiş · Yaklaşan Uyarı · Kilit" },
  { key: "info", label: "Taşıma / Organizasyon", desc: "İş Koluna Taşı · Bağla · Hatırlat · Dışa Aktar" },
  { key: "special", label: "Seçim / Devir", desc: "Seç · Devret · Paylaş · Gruptan Çıkar" },
  { key: "danger", label: "Silme / İptal", desc: "Sil · İptal Et · Kalıcı Sil" },
];

const isHex6 = (v) => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());
const sanitizeActionColors = (p) => {
  const out = { ...DEFAULT_ACTION_COLORS };
  if (p && typeof p === "object") {
    for (const k of Object.keys(DEFAULT_ACTION_COLORS)) {
      if (isHex6(p[k])) out[k] = p[k].trim();
    }
  }
  return out;
};

// Arayüz görünümleri — her birine ad + açıklama. `ready` false olanlar
// sırayla eklenecek (şimdilik yalnızca "Detaylı" aktif = mevcut görünüm).
export const INTERFACES = [
  { key: "detayli", name: "Detaylı", ready: true, desc: "Zengin HUD: holografik küre, canlı istatistikler, yüzen paneller. Her şey ekranda." },
  { key: "kolay", name: "Kolay", ready: true, desc: "Büyük ikonlu kutucuklar, bol boşluk, minimum yazı. Teknik olmayan kullanıcılar için." },
  { key: "profesyonel", name: "Profesyonel", ready: true, desc: "Cilalı kurumsal SaaS: düzenli sol menü, dengeli kart ızgarası, sade vurgular." },
  { key: "teknik", name: "Teknik", ready: true, desc: "Yoğun veri, kompakt satırlar, komut çubuğu, konsol havası. Güçlü kullanıcılar için." },
  { key: "aydinlik", name: "Aydınlık", ready: true, desc: "Açık tema, ferah beyaz zemin, tek sakin vurgu. En az yoran görünüm." },
  { key: "pano", name: "Pano", ready: true, desc: "Kanban: Yapılacak / Devam Eden / Bitti sütunları, sürükle-bırak kartlar." },
];

// #RRGGBB → "r g b" (Tailwind `rgb(var(--sx-accent-rgb) / <alpha>)` için).
export const hexToRgbTriplet = (hex) => {
  try {
    let h = String(hex || "").trim().replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return "0 240 255";
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "0 240 255";
    return `${r} ${g} ${b}`;
  } catch {
    return "0 240 255";
  }
};

const applyAppearance = (s) => {
  try {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-font-scale", s.fontScale || DEFAULT_FONT_SCALE);
    root.setAttribute("data-interface", s.interface || DEFAULT_INTERFACE);
    root.style.setProperty("--sx-accent-rgb", hexToRgbTriplet(s.accent || DEFAULT_ACCENT));
  } catch (e) { /* yut */ }
};

const loadAppearance = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accent: DEFAULT_ACCENT, fontScale: DEFAULT_FONT_SCALE, interface: DEFAULT_INTERFACE, actionColors: { ...DEFAULT_ACTION_COLORS } };
    const p = JSON.parse(raw);
    return {
      accent: p.accent || DEFAULT_ACCENT,
      fontScale: ["s", "m", "l", "xl"].includes(p.fontScale) ? p.fontScale : DEFAULT_FONT_SCALE,
      interface: INTERFACES.some((i) => i.key === p.interface) ? p.interface : DEFAULT_INTERFACE,
      actionColors: sanitizeActionColors(p.actionColors),
    };
  } catch {
    return { accent: DEFAULT_ACCENT, fontScale: DEFAULT_FONT_SCALE, interface: DEFAULT_INTERFACE, actionColors: { ...DEFAULT_ACTION_COLORS } };
  }
};

let listeners = [];
let current = loadAppearance();
applyAppearance(current);

const persist = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch (e) { console.warn("[appearance.js] hata bastırıldı:", e); }
};
const notify = () => listeners.forEach((l) => l(current));

export const useAppearance = () => {
  const [state, setState] = useState(current);
  useEffect(() => {
    const l = (s) => setState(s);
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);
  return state;
};

export const setAccent = (hex) => {
  current = { ...current, accent: hex || DEFAULT_ACCENT };
  persist();
  applyAppearance(current);
  notify();
};

export const resetAccent = () => setAccent(DEFAULT_ACCENT);

export const setFontScale = (key) => {
  const val = ["s", "m", "l", "xl"].includes(key) ? key : DEFAULT_FONT_SCALE;
  current = { ...current, fontScale: val };
  persist();
  applyAppearance(current);
  notify();
};

export const setInterfaceMode = (key) => {
  const val = INTERFACES.some((i) => i.key === key) ? key : DEFAULT_INTERFACE;
  current = { ...current, interface: val };
  persist();
  applyAppearance(current);
  notify();
};

export const setActionColor = (key, hex) => {
  if (!(key in DEFAULT_ACTION_COLORS)) return;
  const base = current.actionColors || DEFAULT_ACTION_COLORS;
  const val = isHex6(hex) ? hex.trim() : DEFAULT_ACTION_COLORS[key];
  current = { ...current, actionColors: { ...base, [key]: val } };
  persist();
  notify();
};

export const resetActionColors = () => {
  current = { ...current, actionColors: { ...DEFAULT_ACTION_COLORS } };
  persist();
  notify();
};

import { useEffect, useState } from "react";

const STORAGE_KEY = "sertex_settings_v1";

export const DEFAULT_COLORS = {
  idle: "#0088FF",     // mavi - beklemede
  speaking: "#00FF88", // yeşil - cevap verirken
  error: "#FF3355",    // kırmızı - hata
  listening: "#00AAFF",
  thinking: "#3399FF",
};

// Görsellik / performans seviyesi (cihaza özel, localStorage). high = mevcut hal.
export const DEFAULT_QUALITY = "high"; // "high" | "normal" | "low"

const applyQualityAttr = (q) => {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-quality", q || DEFAULT_QUALITY);
    }
  } catch (e) { /* yut */ }
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { colors: DEFAULT_COLORS, quality: DEFAULT_QUALITY };
    const parsed = JSON.parse(raw);
    return {
      colors: { ...DEFAULT_COLORS, ...(parsed.colors || {}) },
      quality: parsed.quality || DEFAULT_QUALITY,
    };
  } catch (e) {
    return { colors: DEFAULT_COLORS, quality: DEFAULT_QUALITY };
  }
};

let listeners = [];
let current = loadSettings();
applyQualityAttr(current.quality);

const notify = () => listeners.forEach((l) => l(current));

export const useSettings = () => {
  const [state, setState] = useState(current);
  useEffect(() => {
    const l = (s) => setState(s);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);
  return state;
};

export const setColor = (key, value) => {
  current = {
    ...current,
    colors: { ...current.colors, [key]: value },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) { console.warn("[settings.js] hata bastırıldı:", e); }
  notify();
};

export const resetColors = () => {
  current = { ...current, colors: { ...DEFAULT_COLORS } };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) { console.warn("[settings.js] hata bastırıldı:", e); }
  notify();
};

export const setQuality = (q) => {
  const val = q === "normal" || q === "low" ? q : "high";
  current = { ...current, quality: val };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (e) { console.warn("[settings.js] hata bastırıldı:", e); }
  applyQualityAttr(val);
  notify();
};

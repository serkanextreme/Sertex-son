import { useEffect, useState } from "react";

const STORAGE_KEY = "sertex_settings_v1";

export const DEFAULT_COLORS = {
  idle: "#0088FF",     // mavi - beklemede
  speaking: "#00FF88", // yeşil - cevap verirken
  error: "#FF3355",    // kırmızı - hata
  listening: "#00AAFF",
  thinking: "#3399FF",
};

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { colors: DEFAULT_COLORS };
    const parsed = JSON.parse(raw);
    return {
      colors: { ...DEFAULT_COLORS, ...(parsed.colors || {}) },
    };
  } catch (e) {
    return { colors: DEFAULT_COLORS };
  }
};

let listeners = [];
let current = loadSettings();

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

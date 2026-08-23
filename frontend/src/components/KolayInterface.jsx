import React from "react";
import {
  Home,
  ListTodo,
  StickyNote,
  FolderOpen,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import TasksPanel from "./TasksPanel";

/**
 * KOLAY arayüzü — sade kabuk (slim sol menü + karşılama) + içine GÖMÜLÜ gerçek
 * Neural Link görev paneli (`TasksPanel`). Böylece "Bugünkü Görevler"deki kartlar
 * birebir Neural Link kartı gibi görünür ve TÜM fonksiyonlar (sürükle-sırala,
 * sağ üst 3 düğme: küçült/büyüt · dışarı taşı · ⋮, ⋮ tam bağlam menüsü, iş kolu
 * filtre seçici, sıra numarası, arşiv, arama, yeni görev) Kolay içinde çalışır —
 * kullanıcıyı Detaylı görünüme SIÇRATMADAN. Detaylı görünüm hiç değişmez;
 * TasksPanel paylaşılan bileşen olduğundan burada yalnızca ikinci bir örnek
 * mount edilir (Detaylı'yı bozmaz).
 */
const KolayInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 6) return "İyi geceler";
    if (h < 12) return "Günaydın";
    if (h < 18) return "İyi günler";
    return "İyi akşamlar";
  })();
  const today = new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });

  // Ana Sayfa = Görevler (ikisi de gömülü paneli gösterir → Neural Link'e sıçramaz).
  // Notlar/Dosyalar/Ekip şimdilik mevcut panellere yönlendirir (Aşama 3'te Kolay'a alınacak).
  const MENU = [
    { key: "home", label: "Ana Sayfa", icon: Home, onClick: null },
    { key: "tasks", label: "Görevler", icon: ListTodo, onClick: null },
    ...(teamFeaturesVisible ? [{ key: "team", label: "Ekip", icon: Users, onClick: () => onOpenSection?.("team") }] : []),
    { key: "notes", label: "Notlar", icon: StickyNote, onClick: () => onOpenSection?.("notes") },
    { key: "files", label: "Dosyalar", icon: FolderOpen, onClick: () => onOpenSection?.("files") },
    { key: "settings", label: "Ayarlar", icon: SettingsIcon, onClick: () => onOpenSettings?.() },
  ];

  return (
    <div
      className="absolute inset-0 z-10 overflow-y-auto scrollbar-sertex"
      data-testid="kolay-interface"
      style={{
        right: !isMobile && sidebarOpen ? 360 : 0,
        bottom: isMobile ? 64 : 0,
        transition: "right 300ms",
      }}
    >
      <div className="flex min-h-full">
        {/* Slim sol menü */}
        <div className="w-[132px] shrink-0 border-r border-sertex-cyan/15 p-3 flex flex-col gap-1.5 sticky top-0 self-start" data-testid="kolay-menu">
          <div className="display-text text-sertex-cyan neon-glow tracking-[0.15em] text-xs mb-2 px-1">
            GÖREV<br />MERKEZİ
          </div>
          {MENU.map((m) => {
            const Icon = m.icon;
            const active = m.key === "home" || m.key === "tasks";
            return (
              <button
                key={m.key}
                type="button"
                onClick={m.onClick || undefined}
                data-testid={`kolay-menu-${m.key}`}
                className={`w-full flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
                  active
                    ? "border-sertex-cyan bg-sertex-cyan/10 text-sertex-cyan"
                    : "border-transparent text-sertex-textMuted hover:text-sertex-cyan hover:bg-sertex-cyan/5"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-mono">{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* İçerik */}
        <div className="flex-1 min-w-0 p-5 lg:p-8">
          {/* Karşılama */}
          <div className="mb-5">
            <div className="hud-text text-sertex-textMuted">{today}</div>
            <h1 className="display-text text-2xl lg:text-3xl text-sertex-cyan neon-glow mt-1">
              {greeting}, {user?.username || "Kullanıcı"}!
            </h1>
          </div>

          <div className="hud-text text-sertex-cyan mb-3">BUGÜNKÜ GÖREVLER</div>

          {/* Gömülü Neural Link görev paneli — birebir aynı kartlar + tüm fonksiyonlar. */}
          <div className="max-w-[760px]" data-testid="kolay-tasks-panel">
            <TasksPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default KolayInterface;

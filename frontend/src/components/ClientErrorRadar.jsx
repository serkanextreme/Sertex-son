import React, { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, RefreshCw, Trash2, Bug, Server, BellRing,
  ChevronDown, ChevronRight, CheckCircle2, RotateCcw, Layers, List, BarChart3, X, FileCode2,
} from "lucide-react";
import { clientLogsApi } from "../lib/api";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";

/**
 * Hata Radarı — süper yöneticiye özel frontend (istemci) hata kayıtları paneli.
 * - Ayrı sekme (tek tık): Ayarlar → Hata Radarı.
 * - Çözümleme: bir hatayı "çözüldü" işaretleyip aktif listeden gizle.
 * - Filtre: seviyeye göre süz (Hata+Kritik / Uyarı) + en sık tekrarları grupla.
 * - Yeni-hata bildirimi cooldown (dk) ayarı.
 */

const COOLDOWN_OPTS = [5, 15, 30, 60];
const LEVEL_OPTS = [
  { key: "all", label: "Tümü", param: "" },
  { key: "err", label: "Hata + Kritik", param: "error,critical,fatal" },
  { key: "warn", label: "Uyarı", param: "warning,warn" },
];
const STATUS_OPTS = [
  { key: "active", label: "Aktif" },
  { key: "resolved", label: "Çözüldü" },
  { key: "all", label: "Tümü" },
];

const levelCls = (lvl) => {
  const l = String(lvl || "").toLowerCase();
  if (l === "error" || l === "critical" || l === "fatal") return "text-sertex-danger";
  if (l === "warning" || l === "warn") return "text-orange-300";
  return "text-sertex-textMuted";
};

// "YYYY-MM-DD" → "16 Eyl" (TR, UTC) — gün filtresi etiketi.
const dayLabel = (iso) => {
  try { return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }); }
  catch { return iso; }
};

const groupLogs = (logs, mode = "message") => {
  const map = new Map();
  for (const l of logs) {
    let key, label;
    if (mode === "source") {
      key = (l.source || "").trim();
      label = key || "(kaynak yok)";
    } else {
      key = (l.message || "").trim() || "(boş)";
      label = key;
    }
    if (!map.has(key)) map.set(key, { key, label, count: 0, level: l.level, last: l.created_at, items: [] });
    const g = map.get(key);
    g.count += 1;
    g.items.push(l);
    if (l.created_at && (!g.last || l.created_at > g.last)) { g.last = l.created_at; g.level = l.level; }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

const StatCard = ({ label, value, sub, accent, testid }) => (
  <div data-testid={testid} className={`glass-panel corner-bracket p-3 border ${accent}`}>
    <div className="font-mono font-bold text-2xl tabular-nums neon-glow" data-testid={`${testid}-value`}>{value}</div>
    <div className="hud-text opacity-80 mt-0.5">{label}</div>
    {sub && <div className="text-[10px] font-mono text-sertex-textMuted mt-0.5 normal-case">{sub}</div>}
  </div>
);

// Son 7 gün günlük hata trendi — küçük yığılmış çubuk grafik (Hata + Uyarı
// seviye kırılımı, HUD estetiği, ek bağımlılık yok).
const ErrorTrendChart = ({ daily, selectedDay, onSelectDay }) => {
  const days = Array.isArray(daily) ? daily : [];
  const weekTotal = days.reduce((s, d) => s + (d.count || 0), 0);
  const max = Math.max(1, ...days.map((d) => d.count || 0));
  const todayStr = new Date().toISOString().slice(0, 10);
  const wd = (iso) => {
    try { return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR", { weekday: "short", timeZone: "UTC" }); }
    catch { return ""; }
  };
  const H = 48;
  return (
    <div className="glass-panel corner-bracket p-3 border-orange-400/25" data-testid="error-radar-trend">
      <div className="flex items-center justify-between mb-2">
        <div className="hud-text text-orange-300 flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3" /> SON 7 GÜN · GÜNLÜK HATA
        </div>
        <span className="text-[10px] font-mono text-sertex-textMuted normal-case" data-testid="error-radar-trend-total">
          {weekTotal} toplam
        </span>
      </div>
      {days.length === 0 ? (
        <div className="py-3 text-center text-[11px] font-mono text-sertex-textMuted normal-case">Veri yok</div>
      ) : weekTotal === 0 ? (
        <div className="py-3 text-center text-[11px] font-mono text-emerald-300 normal-case" data-testid="error-radar-trend-empty">Son 7 günde hata yok ✓</div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-1.5" style={{ height: H + 20 }} data-testid="error-radar-trend-bars">
            {days.map((d) => {
              const isToday = d.date === todayStr;
              const isSel = selectedDay === d.date;
              const count = d.count || 0;
              const errors = d.errors || 0;
              const warnings = d.warnings || 0;
              const barH = count > 0 ? Math.max(4, Math.round((count / max) * H)) : 0;
              const seg = (n) => (count > 0 ? Math.round((n / count) * barH) : 0);
              const eH = seg(errors), wH = seg(warnings);
              const oH = Math.max(0, barH - eH - wH);
              const clickable = count > 0;
              return (
                <button
                  type="button"
                  key={d.date}
                  onClick={clickable ? () => onSelectDay?.(d.date) : undefined}
                  disabled={!clickable}
                  aria-pressed={isSel}
                  className={`flex-1 flex flex-col items-center justify-end gap-1 min-w-0 rounded transition-colors ${clickable ? "cursor-pointer hover:bg-sertex-cyan/5" : "cursor-default"} ${isSel ? "bg-sertex-cyan/10" : ""}`}
                  data-testid={`error-radar-trend-day-${d.date}`}
                  title={clickable ? `${wd(d.date)} · ${errors} hata · ${warnings} uyarı — süzmek için tıkla` : `${wd(d.date)} · hata yok`}
                >
                  <span className={`text-[10px] font-mono tabular-nums leading-none ${isSel ? "text-sertex-cyan" : "text-sertex-textMuted/70"}`}>{count || ""}</span>
                  <div className="w-full flex items-end justify-center" style={{ height: H }}>
                    <div
                      className={`w-full max-w-[22px] rounded-t overflow-hidden flex flex-col-reverse ${isSel ? "ring-2 ring-sertex-cyan" : isToday ? "ring-1 ring-sertex-cyan/60" : ""}`}
                      style={{ height: `${barH}px` }}
                    >
                      {eH > 0 && <div className="w-full bg-sertex-danger/80" style={{ height: `${eH}px` }} data-testid={`error-radar-trend-err-${d.date}`} />}
                      {wH > 0 && <div className="w-full bg-orange-400/70" style={{ height: `${wH}px` }} data-testid={`error-radar-trend-warn-${d.date}`} />}
                      {oH > 0 && <div className="w-full bg-sertex-textMuted/30" style={{ height: `${oH}px` }} />}
                    </div>
                  </div>
                  <span className={`hud-text leading-none ${isSel || isToday ? "text-sertex-cyan" : "text-sertex-textMuted"}`}>{wd(d.date)}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] font-mono text-sertex-textMuted normal-case" data-testid="error-radar-trend-legend">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-sertex-danger/80" /> Hata</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-orange-400/70" /> Uyarı</span>
          </div>
        </>
      )}
    </div>
  );
};

const Chip = ({ active, onClick, children, testid }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={`px-2.5 py-1 rounded border hud-text transition-colors ${
      active
        ? "border-sertex-cyan text-sertex-cyan bg-sertex-cyan/10"
        : "border-sertex-cyan/25 text-sertex-textMuted hover:text-sertex-cyan hover:bg-sertex-cyan/5"
    }`}
  >
    {children}
  </button>
);

// En çok hata üreten ilk 3 kaynak — yatay yığılmış mini çubuklar (Hata + Uyarı).
const TopSourcesMini = ({ topSources, onPick }) => {
  const items = (Array.isArray(topSources) ? topSources : []).filter((s) => (s.count || 0) > 0);
  if (items.length === 0) return null;
  const max = Math.max(1, ...items.map((s) => s.count || 0));
  return (
    <div className="glass-panel corner-bracket p-3 border-sertex-danger/20" data-testid="error-radar-topsources">
      <div className="hud-text text-sertex-danger flex items-center gap-1.5 mb-2">
        <FileCode2 className="h-3 w-3" /> EN ÇOK HATA ÜRETEN KAYNAKLAR · 7G
      </div>
      <div className="space-y-1.5">
        {items.map((s, idx) => {
          const label = (s.source || "").trim() || "(kaynak yok)";
          const errors = s.errors || 0;
          const warnings = s.warnings || 0;
          const count = s.count || 0;
          const fillPct = Math.max(6, Math.round((count / max) * 100));
          const ePct = count > 0 ? (errors / count) * 100 : 0;
          const wPct = count > 0 ? (warnings / count) * 100 : 0;
          const oPct = Math.max(0, 100 - ePct - wPct);
          return (
            <button
              type="button"
              key={label}
              onClick={() => onPick?.(s.source || "")}
              data-testid={`error-radar-topsource-${idx}`}
              title={`${label} · ${errors} hata · ${warnings} uyarı — kaynağa göre grupla`}
              className="w-full flex items-center gap-2 text-left group"
            >
              <span className="text-[11px] font-mono text-sertex-textSecondary normal-case truncate w-28 shrink-0 group-hover:text-sertex-cyan">{label}</span>
              <span className="flex-1 h-3 rounded-sm bg-white/5 overflow-hidden">
                <span className="flex h-full" style={{ width: `${fillPct}%` }}>
                  {ePct > 0 && <span className="h-full bg-sertex-danger/80" style={{ width: `${ePct}%` }} />}
                  {wPct > 0 && <span className="h-full bg-orange-400/70" style={{ width: `${wPct}%` }} />}
                  {oPct > 0 && <span className="h-full bg-sertex-textMuted/40" style={{ width: `${oPct}%` }} />}
                </span>
              </span>
              <span className="text-[11px] font-mono tabular-nums text-sertex-danger w-6 text-right shrink-0">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};


const ClientErrorRadar = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("active");
  const [groupMode, setGroupMode] = useState("none");
  const [expanded, setExpanded] = useState({});
  const [day, setDay] = useState("");

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const levelParam = (LEVEL_OPTS.find((o) => o.key === level) || {}).param || "";
      const d = await clientLogsApi.list({ limit: 200, status, level: levelParam, day });
      setData(d);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Hata kayıtları alınamadı");
    } finally {
      setLoading(false);
    }
  }, [status, level, day]);

  const loadCfg = useCallback(async () => {
    try { setCfg(await clientLogsApi.getNotifySettings()); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => { loadCfg(); }, [loadCfg]);

  const saveCfg = async (patch) => {
    const next = { ...(cfg || { cooldown_min: 15, enabled: true }), ...patch };
    setCfg(next);
    setSavingCfg(true);
    try {
      setCfg(await clientLogsApi.setNotifySettings(next));
      toast.success("Bildirim ayarı kaydedildi");
    } catch (e) {
      toast.error("Ayar kaydedilemedi");
      loadCfg();
    } finally {
      setSavingCfg(false);
    }
  };

  const clearAll = async () => {
    if (!(await confirmDialog({ message: "Tüm frontend hata kayıtları kalıcı olarak silinsin mi?", danger: true }))) return;
    try {
      await clientLogsApi.clear();
      await refresh(true);
      toast.success("Hata kayıtları temizlendi");
    } catch (e) {
      toast.error("Temizlenemedi");
    }
  };

  const toggleResolve = async (l) => {
    try {
      await clientLogsApi.resolve(l.id, !l.resolved);
      await refresh(true);
      toast.success(l.resolved ? "Aktif sorunlara geri alındı" : "Çözüldü olarak işaretlendi");
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const resolveGroup = async (g) => {
    const target = status !== "resolved"; // aktif/tümü → çöz; çözüldü görünümü → geri al
    try {
      const r = await clientLogsApi.resolveBulk(
        groupMode === "source"
          ? { by: "source", source: g.key, resolved: target }
          : { by: "message", message: g.key, resolved: target }
      );
      await refresh(true);
      toast.success(`${r?.updated ?? 0} kayıt ${target ? "çözüldü" : "geri alındı"}`);
    } catch {
      toast.error("İşlem başarısız");
    }
  };

  const logs = data?.logs || [];
  const active = data?.active ?? 0;
  const last24h = data?.last_24h ?? 0;
  const total = data?.total ?? 0;
  const groups = groupMode !== "none" ? groupLogs(logs, groupMode) : [];

  return (
    <div className="space-y-4" data-testid="error-radar-panel">
      {/* Header */}
      <div className="glass-panel corner-bracket p-3 border-sertex-danger/30 flex items-center gap-3">
        <div className="h-10 w-10 rounded-md border border-sertex-danger/50 bg-sertex-danger/15 flex items-center justify-center">
          <Bug className="h-5 w-5 text-sertex-danger" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="hud-text text-sertex-danger">HATA RADARI · FRONTEND</div>
          <div className="text-[11px] font-mono text-sertex-textMuted normal-case">
            Web + mobil istemcilerde oluşan yakalanmamış hatalar (30 gün saklanır)
          </div>
        </div>
        <button
          onClick={() => refresh()}
          data-testid="error-radar-refresh"
          disabled={loading}
          className="p-1.5 border border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10 rounded disabled:opacity-40"
          title="Yenile"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          testid="error-radar-active"
          label="AKTİF SORUN" value={active}
          accent={active > 0 ? "border-sertex-danger/40 text-sertex-danger" : "border-emerald-400/30 text-emerald-300"}
          sub={active > 0 ? "Çözüm bekliyor" : "Temiz ✓"}
        />
        <StatCard
          testid="error-radar-24h"
          label="SON 24 SAAT" value={last24h}
          accent="border-orange-400/30 text-orange-300"
          sub={`${total} toplam kayıt`}
        />
      </div>

      {/* Son 7 gün günlük hata trendi */}
      <ErrorTrendChart
        daily={data?.daily}
        selectedDay={day}
        onSelectDay={(dstr) => setDay((prev) => (prev === dstr ? "" : dstr))}
      />

      {/* En çok hata üreten ilk 3 kaynak */}
      <TopSourcesMini topSources={data?.top_sources} onPick={() => setGroupMode("source")} />

      {/* Bildirim ayarı — ayarlanabilir cooldown */}
      <div className="glass-panel corner-bracket p-3 border-sertex-cyan/25 space-y-2.5" data-testid="error-radar-notify">
        <div className="hud-text text-sertex-cyan flex items-center gap-1.5">
          <BellRing className="h-3 w-3" /> YENİ HATA BİLDİRİMİ
        </div>
        <label className="flex items-center gap-2 cursor-pointer" data-testid="error-radar-notify-enabled">
          <input
            type="checkbox"
            checked={cfg?.enabled ?? true}
            disabled={savingCfg || !cfg}
            onChange={(e) => saveCfg({ enabled: e.target.checked })}
            className="accent-sertex-cyan"
          />
          <span className="text-[12px] font-mono text-sertex-text normal-case">
            Yeni hata düşünce süper yöneticilere anlık bildirim gönder
          </span>
        </label>
        <div className={`space-y-1.5 ${cfg?.enabled === false ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="text-[10px] font-mono text-sertex-textMuted normal-case">
            Bildirim sıklığı (spam koruması) — bu süre içinde en fazla 1 toplu bildirim:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COOLDOWN_OPTS.map((m) => (
              <Chip key={m} testid={`error-radar-cooldown-${m}`} active={(cfg?.cooldown_min ?? 15) === m} onClick={() => saveCfg({ cooldown_min: m })}>
                {m < 60 ? `${m} dk` : "1 saat"}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Filtre + görünüm çubuğu */}
      <div className="glass-panel corner-bracket p-3 border-sertex-cyan/20 space-y-2" data-testid="error-radar-filters">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hud-text text-sertex-textMuted">SEVİYE:</span>
          {LEVEL_OPTS.map((o) => (
            <Chip key={o.key} testid={`error-radar-level-${o.key}`} active={level === o.key} onClick={() => setLevel(o.key)}>{o.label}</Chip>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="hud-text text-sertex-textMuted">DURUM:</span>
          {STATUS_OPTS.map((o) => (
            <Chip key={o.key} testid={`error-radar-status-${o.key}`} active={status === o.key} onClick={() => setStatus(o.key)}>{o.label}</Chip>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <Chip testid="error-radar-view-list" active={groupMode === "none"} onClick={() => setGroupMode("none")}>
              <span className="flex items-center gap-1"><List className="h-3 w-3" /> Liste</span>
            </Chip>
            <Chip testid="error-radar-view-message" active={groupMode === "message"} onClick={() => setGroupMode("message")}>
              <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> Mesaj</span>
            </Chip>
            <Chip testid="error-radar-view-source" active={groupMode === "source"} onClick={() => setGroupMode("source")}>
              <span className="flex items-center gap-1"><FileCode2 className="h-3 w-3" /> Kaynak</span>
            </Chip>
          </div>
        </div>
      </div>

      {/* Liste / Grup */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="hud-text text-orange-300 flex items-center gap-1.5">
            <Server className="h-3 w-3" /> {groupMode === "source" ? "KAYNAĞA GÖRE (SIK → SEYREK)" : groupMode === "message" ? "MESAJA GÖRE (SIK → SEYREK)" : "HATA KAYITLARI"}
          </div>
          <div className="flex items-center gap-1.5">
            {day && (
              <button
                onClick={() => setDay("")}
                data-testid="error-radar-day-clear"
                title="Gün filtresini kaldır"
                className="inline-flex items-center gap-1 px-2 py-0.5 border border-sertex-cyan/50 text-sertex-cyan bg-sertex-cyan/10 rounded hud-text transition-colors hover:bg-sertex-cyan/20"
              >
                {dayLabel(day)} <X className="h-3 w-3" />
              </button>
            )}
            {logs.length > 0 && (
              <button
                onClick={clearAll}
                data-testid="error-radar-clear"
                className="inline-flex items-center gap-1 px-2 py-0.5 border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 rounded hud-text transition-colors"
              >
                <Trash2 className="h-3 w-3" /> TEMİZLE
              </button>
            )}
          </div>
        </div>

        {loading && !data ? (
          <div className="py-6 text-center hud-text text-sertex-textMuted" data-testid="error-radar-loading">YÜKLENİYOR...</div>
        ) : logs.length === 0 ? (
          <div className="py-6 text-center text-[11px] font-mono text-sertex-textMuted normal-case border border-sertex-cyan/10 rounded" data-testid="error-radar-empty">
            {day ? `${dayLabel(day)} için kayıt yok.` : status === "resolved" ? "Çözülmüş kayıt yok." : "Aktif frontend hatası yok — sistem temiz ✓"}
          </div>
        ) : groupMode !== "none" ? (
          <div className="space-y-1.5" data-testid="error-radar-groups">
            {groups.map((g, idx) => {
              const open = !!expanded[`g:${g.key}`];
              return (
                <div key={g.key} data-testid={`error-radar-group-${idx}`} className="glass-panel border border-orange-400/20 rounded p-2 text-[11px] font-mono">
                  <div className="flex items-start gap-2">
                    <button onClick={() => setExpanded((p) => ({ ...p, [`g:${g.key}`]: !p[`g:${g.key}`] }))} className="flex-1 text-left flex items-start gap-2 min-w-0">
                      {open ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" /> : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 rounded text-[10px] font-bold bg-sertex-danger/20 text-sertex-danger tabular-nums">×{g.count}</span>
                          <span className={`px-1 rounded text-[9px] font-semibold uppercase ${levelCls(g.level)} bg-sertex-danger/10`}>{g.level || "error"}</span>
                          <span className="text-sertex-textMuted normal-case ml-auto text-[10px]">{g.last ? new Date(g.last).toLocaleString() : ""}</span>
                        </div>
                        <div className="text-sertex-text mt-0.5 normal-case break-words flex items-start gap-1">
                          {groupMode === "source" && <FileCode2 className="h-3 w-3 mt-0.5 shrink-0 text-sertex-cyan" />}
                          <span className="break-words">{g.label}</span>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => resolveGroup(g)}
                      data-testid={`error-radar-group-resolve-${idx}`}
                      title={status === "resolved" ? "Grubu geri al" : "Grubu çöz"}
                      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10 rounded hud-text transition-colors"
                    >
                      {status === "resolved" ? <RotateCcw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {status === "resolved" ? "Geri Al" : `Çöz (${g.count})`}
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 pl-5 space-y-1 border-l border-orange-400/20">
                      {g.items.map((l, i) => (
                        <div key={l.id || i} className="text-[10px] text-sertex-textMuted normal-case flex items-center gap-2">
                          <span className="px-1 rounded bg-sertex-cyan/15 text-sertex-cyan">{l.username || "anonim"}</span>
                          {groupMode === "source" ? (
                            <span className="text-sertex-textSecondary truncate max-w-[320px]">{l.message}</span>
                          ) : (
                            l.source && <span>◈ {l.source}</span>
                          )}
                          <span className="ml-auto">{l.created_at ? new Date(l.created_at).toLocaleString() : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="error-radar-list">
            {logs.map((e, idx) => {
              const open = !!expanded[e.id];
              return (
                <div key={e.id || idx} data-testid={`error-radar-row-${idx}`} className={`glass-panel border rounded p-2 text-[11px] font-mono ${e.resolved ? "border-emerald-400/20 opacity-70" : "border-orange-400/20"}`}>
                  <div className="flex items-start gap-2">
                    <button onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))} className="flex-1 text-left flex items-start gap-2 min-w-0">
                      {e.stack ? (
                        open ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" /> : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" />
                      ) : <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${levelCls(e.level)}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-1 rounded text-[9px] font-semibold uppercase ${levelCls(e.level)} bg-sertex-danger/10`}>{e.level || "error"}</span>
                          <span className="px-1 rounded text-[9px] bg-sertex-cyan/15 text-sertex-cyan normal-case">{e.username || "anonim"}</span>
                          {e.resolved && <span className="px-1 rounded text-[9px] bg-emerald-400/15 text-emerald-300 normal-case">çözüldü</span>}
                          <span className="text-sertex-textMuted normal-case ml-auto text-[10px]">{e.created_at ? new Date(e.created_at).toLocaleString() : ""}</span>
                        </div>
                        <div className="text-sertex-text mt-0.5 normal-case break-words">{e.message}</div>
                        <div className="flex items-center gap-2 flex-wrap text-[10px] text-sertex-textMuted/70 normal-case mt-0.5">
                          {e.source && <span>◈ {e.source}</span>}
                          {e.user_agent && <span>{e.user_agent}</span>}
                          {e.page_url && <span className="truncate max-w-[220px]">{e.page_url}</span>}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => toggleResolve(e)}
                      data-testid={`error-radar-resolve-${idx}`}
                      title={e.resolved ? "Aktife geri al" : "Çözüldü işaretle"}
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border hud-text transition-colors ${
                        e.resolved
                          ? "border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10"
                          : "border-emerald-400/40 text-emerald-300 hover:bg-emerald-400/10"
                      }`}
                    >
                      {e.resolved ? <RotateCcw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      {e.resolved ? "Geri Al" : "Çöz"}
                    </button>
                  </div>
                  {open && e.stack && (
                    <pre className="mt-2 p-2 rounded bg-sertex-bg/70 text-[10px] text-sertex-textSecondary normal-case whitespace-pre-wrap break-words overflow-x-auto scrollbar-sertex">{e.stack}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] font-mono text-sertex-textMuted normal-case text-center pt-1">Otomatik yenileme: 30 saniye</div>
    </div>
  );
};

export default ClientErrorRadar;

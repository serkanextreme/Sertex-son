import React, { useEffect, useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, Trash2, Bug, Server, BellRing, ChevronDown, ChevronRight } from "lucide-react";
import { clientLogsApi } from "../lib/api";
import { toast } from "sonner";
import { confirmDialog } from "@/lib/confirm";

/**
 * Hata Radarı — süper yöneticiye özel, tek-tık erişilen frontend (istemci)
 * hata kayıtları paneli. İçerik `/api/admin/client-logs` uçlarından gelir.
 * Ayrıca yeni-hata bildirimi cooldown ayarını (dk) buradan yönetir.
 */

const COOLDOWN_OPTS = [5, 15, 30, 60];

const levelCls = (lvl) => {
  const l = String(lvl || "").toLowerCase();
  if (l === "error" || l === "critical" || l === "fatal") return "text-sertex-danger";
  if (l === "warning" || l === "warn") return "text-orange-300";
  return "text-sertex-textMuted";
};

const StatCard = ({ label, value, sub, accent, testid }) => (
  <div
    data-testid={testid}
    className={`glass-panel corner-bracket p-3 border ${accent}`}
  >
    <div className="font-mono font-bold text-2xl tabular-nums neon-glow" data-testid={`${testid}-value`}>
      {value}
    </div>
    <div className="hud-text opacity-80 mt-0.5">{label}</div>
    {sub && <div className="text-[10px] font-mono text-sertex-textMuted mt-0.5 normal-case">{sub}</div>}
  </div>
);

const ClientErrorRadar = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [cfg, setCfg] = useState(null);
  const [savingCfg, setSavingCfg] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await clientLogsApi.list(200);
      setData(d);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Hata kayıtları alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCfg = useCallback(async () => {
    try {
      setCfg(await clientLogsApi.getNotifySettings());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    refresh();
    loadCfg();
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh, loadCfg]);

  const saveCfg = async (patch) => {
    const next = { ...(cfg || { cooldown_min: 15, enabled: true }), ...patch };
    setCfg(next);
    setSavingCfg(true);
    try {
      const saved = await clientLogsApi.setNotifySettings(next);
      setCfg(saved);
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
      setData({ logs: [], total: 0, last_24h: 0 });
      toast.success("Hata kayıtları temizlendi");
    } catch (e) {
      toast.error("Temizlenemedi");
    }
  };

  const logs = data?.logs || [];
  const last24h = data?.last_24h ?? 0;
  const total = data?.total ?? 0;

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
          testid="error-radar-24h"
          label="SON 24 SAAT" value={last24h}
          accent={last24h > 0 ? "border-sertex-danger/40 text-sertex-danger" : "border-emerald-400/30 text-emerald-300"}
          sub={last24h > 0 ? "İnceleme gerekli" : "Temiz"}
        />
        <StatCard
          testid="error-radar-total"
          label="TOPLAM KAYIT" value={total}
          accent="border-orange-400/30 text-orange-300"
        />
      </div>

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
            {COOLDOWN_OPTS.map((m) => {
              const active = (cfg?.cooldown_min ?? 15) === m;
              return (
                <button
                  key={m}
                  data-testid={`error-radar-cooldown-${m}`}
                  onClick={() => saveCfg({ cooldown_min: m })}
                  disabled={savingCfg}
                  className={`px-2.5 py-1 rounded border hud-text transition-colors ${
                    active
                      ? "border-sertex-cyan text-sertex-cyan bg-sertex-cyan/10"
                      : "border-sertex-cyan/25 text-sertex-textMuted hover:text-sertex-cyan hover:bg-sertex-cyan/5"
                  }`}
                >
                  {m < 60 ? `${m} dk` : "1 saat"}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Log list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="hud-text text-orange-300 flex items-center gap-1.5">
            <Server className="h-3 w-3" /> HATA KAYITLARI
          </div>
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

        {loading && !data ? (
          <div className="py-6 text-center hud-text text-sertex-textMuted" data-testid="error-radar-loading">
            YÜKLENİYOR...
          </div>
        ) : logs.length === 0 ? (
          <div
            className="py-6 text-center text-[11px] font-mono text-sertex-textMuted normal-case border border-sertex-cyan/10 rounded"
            data-testid="error-radar-empty"
          >
            Frontend hatası kaydı yok — sistem temiz ✓
          </div>
        ) : (
          <div className="space-y-1.5" data-testid="error-radar-list">
            {logs.map((e, idx) => {
              const open = !!expanded[e.id];
              return (
                <div
                  key={e.id || idx}
                  data-testid={`error-radar-row-${idx}`}
                  className="glass-panel border border-orange-400/20 rounded p-2 text-[11px] font-mono"
                >
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))}
                    className="w-full text-left flex items-start gap-2"
                  >
                    {e.stack ? (
                      open ? <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" />
                        : <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-sertex-textMuted" />
                    ) : <AlertTriangle className={`h-3 w-3 mt-0.5 shrink-0 ${levelCls(e.level)}`} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-1 rounded text-[9px] font-semibold uppercase ${levelCls(e.level)} bg-sertex-danger/10`}>
                          {e.level || "error"}
                        </span>
                        <span className="px-1 rounded text-[9px] bg-sertex-cyan/15 text-sertex-cyan normal-case">
                          {e.username || "anonim"}
                        </span>
                        <span className="text-sertex-textMuted normal-case ml-auto text-[10px]">
                          {e.created_at ? new Date(e.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      <div className="text-sertex-text mt-0.5 normal-case break-words">{e.message}</div>
                      <div className="flex items-center gap-2 flex-wrap text-[10px] text-sertex-textMuted/70 normal-case mt-0.5">
                        {e.source && <span>◈ {e.source}</span>}
                        {e.user_agent && <span>{e.user_agent}</span>}
                        {e.page_url && <span className="truncate max-w-[220px]">{e.page_url}</span>}
                      </div>
                    </div>
                  </button>
                  {open && e.stack && (
                    <pre className="mt-2 p-2 rounded bg-sertex-bg/70 text-[10px] text-sertex-textSecondary normal-case whitespace-pre-wrap break-words overflow-x-auto scrollbar-sertex">
                      {e.stack}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] font-mono text-sertex-textMuted normal-case text-center pt-1">
        Otomatik yenileme: 30 saniye
      </div>
    </div>
  );
};

export default ClientErrorRadar;

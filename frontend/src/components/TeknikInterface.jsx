import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { setInterfaceMode } from "../lib/appearance";
import { isActive, bucketOf, fmtDate, matchesQuery } from "../lib/interfaceHelpers";
import { useTaskBulk } from "../lib/useTaskBulk";
import { useTaskActions } from "../lib/useTaskActions";
import { computeTaskNumbers } from "../lib/taskBulkActions";
import { TaskBulkBar } from "./tasks/TaskBulkBar";
import { TaskCardModal } from "./tasks/TaskCardModal";
import { flattenSubs } from "../lib/subtaskTree";

const shortId = (id) => "T" + String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase();

const subLabel = (t) => {
  const subs = flattenSubs(Array.isArray(t.subtasks) ? t.subtasks : []);
  if (!subs.length) return "0";
  const done = subs.filter((s) => s.done || s.status === "done").length;
  return `${done}/${subs.length}`;
};

/**
 * TEKNİK arayüzü — yoğun, konsol/terminal havası. Monospace tablo + komut çubuğu.
 * Artık TAM güç: çoklu seçim + toplu işlem + satıra tıklayınca tam görev kartı
 * (koyu TaskCard) modalı → düzenleme, alt görevler, promote, kilit, tüm menü.
 */
const TeknikInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = () => {
    Promise.all([
      tasksApi.list(false, "mine").catch(() => []),
      taskCategoriesApi.list("my_tasks").catch(() => []),
      tasksApi.listGroups().catch(() => []),
    ]).then(([ts, cs, gs]) => {
      setTasks(Array.isArray(ts) ? ts : []);
      setCats(Array.isArray(cs) ? cs : []);
      setGroups(Array.isArray(gs) ? gs : []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const catName = (id) => cats.find((c) => c.id === id)?.name || null;
  const rows = useMemo(
    () => tasks.filter(isActive).filter((t) => matchesQuery(t, q, catName)),
    [tasks, cats, q]
  );
  const numById = useMemo(() => computeTaskNumbers(rows), [rows]);
  const sel = tasks.find((t) => t.id === selId) || null;
  const openTask = tasks.find((t) => t.id === openId) || null;

  const actions = useTaskActions({ tasks, setTasks, cats, groups, user, load, numberFor: (id) => numById[id], highlight: q });
  const bulk = useTaskBulk({ numberFor: (id) => numById[id], refresh: load });

  // Modal içindeki görev tamamlanır/arşivlenir/silinirse modalı kapat.
  useEffect(() => {
    if (openId && (!openTask || openTask.status === "done" || openTask.archived || openTask.deleted)) {
      setOpenId(null);
    }
  }, [openId, openTask]);

  const rowClick = (t) => {
    if (bulk.selectMode) { bulk.toggle(t.id); return; }
    setSelId(t.id);
    setOpenId(t.id);
  };

  const MENU = [
    { k: "PANEL", onClick: null, active: true },
    { k: "GÖREVLER", onClick: () => onOpenSection?.("tasks") },
    ...(teamFeaturesVisible ? [{ k: "EKİP", onClick: () => onOpenSection?.("team") }] : []),
    { k: "NOTLAR", onClick: () => onOpenSection?.("notes") },
    { k: "DOSYALAR", onClick: () => onOpenSection?.("files") },
    { k: "AYARLAR", onClick: () => onOpenSettings?.() },
  ];

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden font-mono"
      data-testid="teknik-interface"
      style={{ right: !isMobile && sidebarOpen ? 360 : 0, bottom: isMobile ? 64 : 0, transition: "right 300ms", background: "#04060d" }}
    >
      <div className="flex flex-col h-full">
        {/* Üst komut çubuğu */}
        <div className="shrink-0 border-b border-sertex-cyan/25 px-4 py-2.5 flex items-center gap-3">
          <div className="text-sertex-cyan font-bold tracking-widest neon-glow">[TEKNİK]</div>
          <div className="flex-1 max-w-xl">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="> ara | filtrele | görev bul"
              data-testid="teknik-search"
              className="w-full bg-black/40 border border-sertex-cyan/30 rounded px-3 py-1.5 text-xs text-sertex-cyan placeholder:text-sertex-textMuted focus:border-sertex-cyan outline-none"
            />
          </div>
          {!bulk.selectMode && rows.length > 0 && (
            <button onClick={() => bulk.start()} data-testid="teknik-bulk-select" className="px-2.5 py-1.5 rounded border border-violet-400/50 bg-violet-500/10 text-violet-200 text-[11px] hover:bg-violet-500/20 transition-colors">SEÇ [ ]</button>
          )}
          <button onClick={() => onOpenSection?.("tasks")} data-testid="teknik-new-task" className="px-2.5 py-1.5 rounded border border-sertex-cyan/50 bg-sertex-cyan/10 text-sertex-cyan text-[11px] hover:bg-sertex-cyan/20 transition-colors">NEW_TASK +</button>
          <button onClick={() => onOpenSettings?.()} data-testid="teknik-settings" className="px-2.5 py-1.5 text-[11px] text-sertex-textMuted hover:text-sertex-cyan transition-colors">SETTINGS</button>
          <button onClick={() => { setInterfaceMode("detayli"); toast.success("Detaylı görünüme geçildi"); }} data-testid="teknik-switch-detayli" className="px-2.5 py-1.5 text-[11px] text-sertex-textMuted hover:text-sertex-cyan transition-colors">DETAYLI</button>
          <span className="text-[11px] text-sertex-textMuted">{user?.username}</span>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sol menü */}
          <div className="w-[140px] shrink-0 border-r border-sertex-cyan/20 p-2 space-y-1" data-testid="teknik-menu">
            {MENU.map((m) => (
              <button
                key={m.k}
                onClick={m.onClick || undefined}
                data-testid={`teknik-nav-${m.k.toLowerCase()}`}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
                  m.active ? "bg-sertex-cyan/15 text-sertex-cyan border-l-2 border-sertex-cyan" : "text-sertex-textMuted hover:text-sertex-cyan hover:bg-sertex-cyan/5"
                }`}
              >[{m.k}]</button>
            ))}
          </div>

          {/* Tablo */}
          <div className="flex-1 min-w-0 overflow-auto scrollbar-sertex">
            <div className="px-4 py-2 text-[11px] text-sertex-textMuted border-b border-sertex-cyan/15 sticky top-0 bg-[#04060d] z-10">
              TÜM AKTİF GÖREVLER · {rows.length} kayıt
            </div>
            {bulk.selectMode && (
              <div className="px-4 pt-2 sticky top-[33px] z-20 bg-[#04060d]">
                <TaskBulkBar
                  count={bulk.ids.length}
                  testPrefix="teknik-bulk"
                  categories={cats}
                  onSelectAll={() => bulk.selectAll(rows.map((t) => t.id))}
                  onClear={bulk.clear}
                  onCancel={bulk.exit}
                  onAction={bulk.runAction}
                />
              </div>
            )}
            {loading ? (
              <div className="p-6 text-xs text-sertex-textMuted" data-testid="teknik-loading">YÜKLENİYOR...</div>
            ) : (
              <table className="w-full text-[11px]" data-testid="teknik-table">
                <thead>
                  <tr className="text-sertex-textMuted border-b border-sertex-cyan/15">
                    {bulk.selectMode && <th className="w-8 px-2 py-2"></th>}
                    <th className="text-left font-normal px-4 py-2">ID</th>
                    <th className="text-left font-normal px-2 py-2">#</th>
                    <th className="text-left font-normal px-2 py-2">GÖREV</th>
                    <th className="text-left font-normal px-2 py-2 hidden lg:table-cell">İŞ KOLU</th>
                    <th className="text-left font-normal px-2 py-2">DURUM</th>
                    <th className="text-left font-normal px-2 py-2 hidden xl:table-cell">ALT</th>
                    <th className="text-left font-normal px-2 py-2 hidden lg:table-cell">SON TARİH</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => {
                    const b = bucketOf(t);
                    const bc = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
                    const on = selId === t.id;
                    const checked = bulk.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => rowClick(t)}
                        data-testid={`teknik-row-${t.id}`}
                        className={`border-b border-white/5 cursor-pointer transition-colors ${checked ? "bg-violet-500/15" : on ? "bg-sertex-cyan/10" : "hover:bg-white/5"}`}
                      >
                        {bulk.selectMode && (
                          <td className="px-2 py-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); bulk.toggle(t.id); }}
                              data-testid={`teknik-select-${t.id}`}
                              aria-label="Seç"
                              className={checked ? "text-violet-300" : "text-sertex-textMuted hover:text-violet-300"}
                            >[{checked ? "x" : " "}]</button>
                          </td>
                        )}
                        <td className="px-4 py-2 text-sertex-cyan whitespace-nowrap">{shortId(t.id)}</td>
                        <td className="px-2 py-2 text-sertex-textMuted tabular-nums whitespace-nowrap">{numById[t.id] ?? "—"}</td>
                        <td className="px-2 py-2 text-sertex-text max-w-[280px] truncate">{t.title}</td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden lg:table-cell truncate max-w-[140px]">{catName(t.category_id) || "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap"><span style={{ color: bc }}>[{b.label}]</span></td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden xl:table-cell whitespace-nowrap tabular-nums">{subLabel(t)}</td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden lg:table-cell whitespace-nowrap">{fmtDate(t.due_date) || "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <button onClick={(e) => { e.stopPropagation(); actions.setStatus(t.id, "done"); }} data-testid={`teknik-complete-${t.id}`} className="text-emerald-400 hover:text-emerald-300 mr-2">[✓]</button>
                          <button onClick={(e) => { e.stopPropagation(); rowClick(t); }} data-testid={`teknik-open-${t.id}`} className="text-sertex-cyan hover:text-sertex-cyan/80">[AÇ]</button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={bulk.selectMode ? 9 : 8} className="px-4 py-8 text-center text-sertex-textMuted" data-testid="teknik-empty">// aktif görev yok</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Detay paneli */}
          <div className="w-[280px] shrink-0 border-l border-sertex-cyan/20 p-4 overflow-y-auto scrollbar-sertex hidden xl:block" data-testid="teknik-details">
            {!sel ? (
              <div className="text-[11px] text-sertex-textMuted">// bir görev seç → detaylar</div>
            ) : (
              <div className="space-y-3">
                <div className="text-sertex-cyan text-[11px]">DETAY: {shortId(sel.id)}</div>
                <div className="text-sertex-text text-sm">{sel.title}</div>
                {sel.description && <div className="text-[11px] text-sertex-textSecondary whitespace-pre-wrap">{sel.description}</div>}
                <div className="text-[11px] text-sertex-textMuted space-y-1 pt-2 border-t border-white/10">
                  <div>durum : <span style={{ color: bucketOf(sel).color === "accent" ? "rgb(var(--sx-accent-rgb))" : bucketOf(sel).color }}>{bucketOf(sel).label}</span></div>
                  <div>iş_kolu : {catName(sel.category_id) || "—"}</div>
                  <div>sahibi : {sel.assignee_name || "—"}</div>
                  <div>son_tarih : {fmtDate(sel.due_date) || "—"}</div>
                  <div>alt_görev : {subLabel(sel)}</div>
                </div>
                <button onClick={() => setOpenId(sel.id)} data-testid="teknik-detail-open" className="w-full py-1.5 rounded border border-sertex-cyan/50 text-sertex-cyan text-[11px] hover:bg-sertex-cyan/10">TAM KARTI AÇ</button>
                <button onClick={() => actions.setStatus(sel.id, "done")} data-testid="teknik-detail-complete" className="w-full py-1.5 rounded border border-emerald-400/50 text-emerald-300 text-[11px] hover:bg-emerald-400/10">TAMAMLA [✓]</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {openTask && (
        <TaskCardModal cardProps={actions.cardPropsFor(openTask)} onClose={() => setOpenId(null)} />
      )}
      {actions.modalsElement}
    </div>
  );
};

export default TeknikInterface;

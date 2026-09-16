import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { tasksApi, taskCategoriesApi } from "../lib/api";
import { useAuth } from "../lib/auth";
import { setInterfaceMode } from "../lib/appearance";
import { bucketOf, fmtDate, matchesQuery } from "../lib/interfaceHelpers";
import { useTaskBulk } from "../lib/useTaskBulk";
import { useTaskActions } from "../lib/useTaskActions";
import { computeTaskNumbers } from "../lib/taskBulkActions";
import { TaskBulkBar } from "./tasks/TaskBulkBar";
import { TaskCardModal } from "./tasks/TaskCardModal";
import { AddTaskModal } from "./tasks/AddTaskModal";
import TaskCategoriesManagement from "./TaskCategoriesManagement";
import { TemplateBar } from "./tasks/TemplateBar";
import { TemplatesModal } from "./tasks/TemplatesModal";
import { TaskPasteMenu } from "./tasks/TaskPasteMenu";
import ExportSelectModal from "./ExportSelectModal";
import { flattenSubs } from "../lib/subtaskTree";

const shortId = (id) => "T" + String(id || "").replace(/-/g, "").slice(0, 6).toUpperCase();
const subLabel = (t) => {
  const subs = flattenSubs(Array.isArray(t.subtasks) ? t.subtasks : []);
  if (!subs.length) return "0";
  const done = subs.filter((s) => s.done || s.status === "done").length;
  return `${done}/${subs.length}`;
};
const bucketKey = (t) => (t.status === "done" ? "bitti" : t.status === "paused" ? "bekliyor" : (t.due_date && new Date(t.due_date).getTime() < Date.now()) ? "gecti" : "aktif");
const STATUS_FILTERS = [
  { key: "aktif", label: "AKTİF", color: "rgb(var(--sx-accent-rgb))" },
  { key: "gecti", label: "GEÇTİ", color: "#f43f5e" },
  { key: "bekliyor", label: "BEKLİYOR", color: "#f59e0b" },
  { key: "bitti", label: "BİTTİ", color: "#10b981" },
];

/**
 * TEKNİK arayüzü — konsol/terminal havası. Detaylı ile birebir fonksiyon:
 * görev ekleme, iş kolu yönetimi, durum filtreleri, şablon, kopyala-yapıştır,
 * çoklu seçim+toplu işlem, arşiv/çöp, dışa aktar + satıra tıkla → tam görev kartı.
 */
const TeknikInterface = ({ onOpenSection, onOpenSettings, sidebarOpen, isMobile }) => {
  const { user, teamFeaturesVisible } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [archiveTasks, setArchiveTasks] = useState([]);
  const [cats, setCats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selId, setSelId] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [view, setView] = useState("active"); // active | archived | trash
  const [statusFilters, setStatusFilters] = useState(["aktif", "gecti", "bekliyor", "bitti"]);
  const [showAdd, setShowAdd] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [pasteMenu, setPasteMenu] = useState(null);
  const [templateRefresh, setTemplateRefresh] = useState(0);

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
  useEffect(() => {
    if (view === "active") return;
    tasksApi.list(true, "mine", view === "trash" ? "trash" : "archived")
      .then((r) => setArchiveTasks(Array.isArray(r) ? r : [])).catch(() => setArchiveTasks([]));
  }, [view, templateRefresh]);

  const reloadAll = () => { load(); setTemplateRefresh((n) => n + 1); };
  const catName = (id) => cats.find((c) => c.id === id)?.name || null;

  const rows = useMemo(() => {
    let base = tasks.filter((t) => !t.archived && !t.deleted);
    base = base.filter((t) => statusFilters.includes(bucketKey(t)));
    return base.filter((t) => matchesQuery(t, q, catName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, cats, q, statusFilters]);
  const archiveVisible = useMemo(
    () => archiveTasks.filter((t) => matchesQuery(t, q, catName)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [archiveTasks, cats, q]
  );
  const gridRows = view === "active" ? rows : archiveVisible;
  const numById = useMemo(() => computeTaskNumbers(rows), [rows]);
  const groupById = useMemo(() => Object.fromEntries((groups || []).map((g) => [g.id, g])), [groups]);
  // Bağlı görevleri (grup) blok halinde göster: grup başlığı satırı + üyeler.
  const renderSeq = useMemo(() => {
    if (view !== "active") return gridRows.map((t) => ({ kind: "task", task: t }));
    const counts = {};
    for (const t of gridRows) { const g = t.group_id && groupById[t.group_id] ? t.group_id : null; if (g) counts[g] = (counts[g] || 0) + 1; }
    const seq = []; const seen = new Set();
    for (const t of gridRows) {
      const g = t.group_id && groupById[t.group_id] ? t.group_id : null;
      if (g && counts[g] >= 2) {
        if (!seen.has(g)) {
          seen.add(g);
          const members = gridRows.filter((x) => x.group_id === g);
          seq.push({ kind: "group", gid: g, group: groupById[g], total: members.length, done: members.filter((x) => x.status === "done").length });
          for (const m of members) seq.push({ kind: "task", task: m, inGroup: true });
        }
      } else {
        seq.push({ kind: "task", task: t });
      }
    }
    return seq;
  }, [gridRows, groupById, view]);
  const sel = tasks.find((t) => t.id === selId) || null;
  const openTask = tasks.find((t) => t.id === openId) || null;

  const actions = useTaskActions({ tasks, setTasks, cats, groups, user, load: reloadAll, numberFor: (id) => numById[id], highlight: q });
  const bulk = useTaskBulk({ numberFor: (id) => numById[id], refresh: reloadAll });

  useEffect(() => {
    if (openId && (!openTask || openTask.status === "done" || openTask.archived || openTask.deleted)) setOpenId(null);
  }, [openId, openTask]);

  const toggleStatus = (k) => setStatusFilters((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const rowClick = (t) => {
    if (view !== "active") return;
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
  const cmdBtn = "px-2.5 py-1.5 rounded border text-[11px] transition-colors";

  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden font-mono"
      data-testid="teknik-interface"
      style={{ right: !isMobile && sidebarOpen ? 360 : 0, bottom: isMobile ? 64 : 0, transition: "right 300ms", background: "#04060d" }}
    >
      <div className="flex flex-col h-full">
        {/* Üst komut çubuğu */}
        <div className="shrink-0 border-b border-sertex-cyan/25 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="text-sertex-cyan font-bold tracking-widest neon-glow">[TEKNİK]</div>
          <div className="flex-1 min-w-[180px] max-w-xl">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="> ara | filtrele | görev bul"
              data-testid="teknik-search"
              className="w-full bg-black/40 border border-sertex-cyan/30 rounded px-3 py-1.5 text-xs text-sertex-cyan placeholder:text-sertex-textMuted focus:border-sertex-cyan outline-none"
            />
          </div>
          {view === "active" && !bulk.selectMode && rows.length > 0 && (
            <button onClick={() => bulk.start()} data-testid="teknik-bulk-select" className={`${cmdBtn} border-violet-400/50 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20`}>SEÇ [ ]</button>
          )}
          {view === "active" && actions.clipboard?.sourceId && (
            <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPasteMenu({ x: r.left, y: r.bottom + 4 }); }} data-testid="teknik-paste" className={`${cmdBtn} border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10`}>YAPIŞTIR</button>
          )}
          <button onClick={() => setShowAdd(true)} data-testid="teknik-new-task" className={`${cmdBtn} border-sertex-cyan/50 bg-sertex-cyan/10 text-sertex-cyan hover:bg-sertex-cyan/20`}>NEW_TASK +</button>
          <button onClick={() => setShowCats(true)} data-testid="teknik-manage-cats" className={`${cmdBtn} border-white/10 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40`}>İŞ_KOLLARI</button>
          <button onClick={() => setShowTemplates(true)} data-testid="teknik-templates" className={`${cmdBtn} border-white/10 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40`}>ŞABLON</button>
          <button onClick={() => setShowExport(true)} data-testid="teknik-export" className={`${cmdBtn} border-white/10 text-sertex-textMuted hover:text-sertex-cyan hover:border-sertex-cyan/40`}>EXPORT</button>
          <button onClick={() => onOpenSettings?.()} data-testid="teknik-settings" className={`${cmdBtn} border-transparent text-sertex-textMuted hover:text-sertex-cyan`}>SETTINGS</button>
          <button onClick={() => { setInterfaceMode("detayli"); toast.success("Detaylı görünüme geçildi"); }} data-testid="teknik-switch-detayli" className={`${cmdBtn} border-transparent text-sertex-textMuted hover:text-sertex-cyan`}>DETAYLI</button>
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
            {/* Görünüm sekmeleri + durum filtreleri */}
            <div className="px-4 pt-2.5 sticky top-0 bg-[#04060d] z-10 space-y-2 border-b border-sertex-cyan/15 pb-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[{ k: "active", label: "AKTİF" }, { k: "archived", label: "ARŞİV" }, { k: "trash", label: "ÇÖP" }].map((v) => (
                  <button
                    key={v.k}
                    onClick={() => { setView(v.k); bulk.exit(); }}
                    data-testid={`teknik-view-${v.k}`}
                    className={`px-2.5 py-1 rounded border text-[11px] transition-colors ${view === v.k ? "border-sertex-cyan bg-sertex-cyan/15 text-sertex-cyan" : "border-white/10 text-sertex-textMuted hover:text-sertex-cyan"}`}
                  >[{v.label}]</button>
                ))}
                {view === "trash" && archiveVisible.length > 0 && (
                  <button onClick={() => actions.emptyTrash("mine")} data-testid="teknik-empty-trash" className="ml-auto px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 text-[11px] hover:bg-rose-500/15">ÇÖPÜ_BOŞALT</button>
                )}
                <span className={`text-[11px] text-sertex-textMuted ${view === "trash" && archiveVisible.length > 0 ? "" : "ml-auto"}`}>{gridRows.length} kayıt</span>
              </div>
              {view === "active" && (
                <div className="flex items-center gap-1.5 flex-wrap" data-testid="teknik-status-filters">
                  {STATUS_FILTERS.map((s) => {
                    const on = statusFilters.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleStatus(s.key)}
                        data-testid={`teknik-status-${s.key}`}
                        className="px-2 py-0.5 rounded border text-[10px] transition-colors"
                        style={on ? { borderColor: s.color, color: s.color, background: `${s.color}18` } : { borderColor: "rgba(255,255,255,0.12)", color: "#6b7280" }}
                      >[{s.label}]</button>
                    );
                  })}
                </div>
              )}
              {view === "active" && (
                <div data-testid="teknik-template-bar"><TemplateBar refreshKey={templateRefresh} onUse={actions.handleUseTemplate} onManage={() => setShowTemplates(true)} /></div>
              )}
            </div>
            {bulk.selectMode && (
              <div className="px-4 pt-2 sticky top-[118px] z-20 bg-[#04060d]">
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
                    {view === "active" && bulk.selectMode && <th className="w-8 px-2 py-2"></th>}
                    <th className="text-left font-normal px-4 py-2">ID</th>
                    {view === "active" && <th className="text-left font-normal px-2 py-2">#</th>}
                    <th className="text-left font-normal px-2 py-2">GÖREV</th>
                    <th className="text-left font-normal px-2 py-2 hidden lg:table-cell">İŞ KOLU</th>
                    <th className="text-left font-normal px-2 py-2">DURUM</th>
                    <th className="text-left font-normal px-2 py-2 hidden xl:table-cell">ALT</th>
                    <th className="text-left font-normal px-2 py-2 hidden lg:table-cell">TARİH</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {renderSeq.map((it) => {
                    if (it.kind === "group") {
                      return (
                        <tr key={`g:${it.gid}`} data-testid={`teknik-group-${it.gid}`} className="bg-sertex-cyan/[0.07] border-b border-sertex-cyan/25">
                          <td colSpan={9} className="px-4 py-1.5">
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-sertex-cyan">⛓</span>
                              <span className="text-sertex-cyan tracking-widest truncate flex-1">{(it.group.name || "BAĞLI GÖREVLER").toUpperCase()}</span>
                              {it.group.show_progress && <span className="text-sertex-textMuted tabular-nums">[{it.done}/{it.total}]</span>}
                              <button onClick={() => actions.editGroup(it.group)} data-testid={`teknik-group-edit-${it.gid}`} className="text-sertex-textMuted hover:text-sertex-cyan">[DÜZENLE]</button>
                              <button onClick={() => actions.dissolveGroupModed(it.group)} data-testid={`teknik-group-dissolve-${it.gid}`} className="text-rose-300 hover:text-rose-200">[ÇÖZ]</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const t = it.task;
                    const b = bucketOf(t);
                    const bc = b.color === "accent" ? "rgb(var(--sx-accent-rgb))" : b.color;
                    const on = selId === t.id;
                    const checked = bulk.has(t.id);
                    return (
                      <tr
                        key={t.id}
                        onClick={() => rowClick(t)}
                        data-testid={`teknik-row-${t.id}`}
                        className={`border-b border-white/5 transition-colors ${it.inGroup ? "border-l-2 border-l-sertex-cyan/40" : ""} ${view === "active" ? "cursor-pointer" : ""} ${checked ? "bg-violet-500/15" : on ? "bg-sertex-cyan/10" : "hover:bg-white/5"}`}
                      >
                        {view === "active" && bulk.selectMode && (
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
                        {view === "active" && <td className="px-2 py-2 text-sertex-textMuted tabular-nums whitespace-nowrap">{numById[t.id] ?? "—"}</td>}
                        <td className="px-2 py-2 text-sertex-text max-w-[280px] truncate">{t.title}</td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden lg:table-cell truncate max-w-[140px]">{catName(t.category_id) || "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap"><span style={{ color: bc }}>[{b.label}]</span></td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden xl:table-cell whitespace-nowrap tabular-nums">{subLabel(t)}</td>
                        <td className="px-2 py-2 text-sertex-textMuted hidden lg:table-cell whitespace-nowrap">{fmtDate(t.due_date) || fmtDate(t.archived_at || t.deleted_at) || "—"}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {view === "active" && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); actions.setStatus(t.id, "done"); }} data-testid={`teknik-complete-${t.id}`} className="text-emerald-400 hover:text-emerald-300 mr-2">[✓]</button>
                              <button onClick={(e) => { e.stopPropagation(); rowClick(t); }} data-testid={`teknik-open-${t.id}`} className="text-sertex-cyan hover:text-sertex-cyan/80">[AÇ]</button>
                            </>
                          )}
                          {view === "archived" && (
                            <button onClick={(e) => { e.stopPropagation(); actions.setArchived(t.id, false); }} data-testid={`teknik-restore-${t.id}`} className="text-sertex-cyan hover:text-sertex-cyan/80">[AKTİFE_AL]</button>
                          )}
                          {view === "trash" && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); actions.restoreTask(t.id); }} data-testid={`teknik-restore-${t.id}`} className="text-sertex-cyan hover:text-sertex-cyan/80 mr-2">[GERİ]</button>
                              <button onClick={(e) => { e.stopPropagation(); actions.permanentDeleteTask(t.id); }} data-testid={`teknik-permdelete-${t.id}`} className="text-rose-400 hover:text-rose-300">[SİL]</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {gridRows.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sertex-textMuted" data-testid="teknik-empty">// {view === "trash" ? "çöp boş" : view === "archived" ? "arşiv boş" : "aktif görev yok"}</td></tr>
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

      {showAdd && (
        <AddTaskModal testPrefix="teknik-add" cats={cats} onClose={() => setShowAdd(false)} onCreated={reloadAll} />
      )}

      {showCats && (
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8" onClick={() => { setShowCats(false); reloadAll(); }} data-testid="teknik-cats-modal">
          <div className="relative w-full max-w-3xl my-auto glass-panel corner-bracket border border-sertex-cyan/30 rounded-xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sertex-cyan text-[11px] tracking-widest">[İŞ KOLLARINI YÖNET]</div>
              <button onClick={() => { setShowCats(false); reloadAll(); }} data-testid="teknik-cats-close" className="text-sertex-textMuted hover:text-sertex-cyan text-lg leading-none">×</button>
            </div>
            <TaskCategoriesManagement />
          </div>
        </div>
      )}

      {showTemplates && (
        <TemplatesModal categories={cats} currentUser={user} onClose={() => { setShowTemplates(false); setTemplateRefresh((n) => n + 1); }} onUse={actions.handleUseTemplate} />
      )}

      {pasteMenu && actions.clipboard?.sourceId && (
        <TaskPasteMenu
          x={pasteMenu.x}
          y={pasteMenu.y}
          title={actions.clipboard.title}
          targetName="Kolsuz"
          onPaste={() => actions.handlePaste(null, "Kolsuz")}
          onClear={() => actions.clearTaskClipboard()}
          onClose={() => setPasteMenu(null)}
        />
      )}

      {showExport && (
        <ExportSelectModal tasks={gridRows} categories={cats} onClose={() => setShowExport(false)} />
      )}
    </div>
  );
};

export default TeknikInterface;

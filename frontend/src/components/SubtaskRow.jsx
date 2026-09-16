import { useEffect, useState, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Check, Pause, MoreVertical, Clock, AlertTriangle, Bell, GripVertical, Anchor, Circle, CheckCircle2, CornerDownRight } from "lucide-react";
import { Highlight } from "./tasks/Highlight";
import { SubtaskTree } from "./SubtaskTree";

const subIsOverdue = (s) => {
  if (s.done || s.status === "done" || s.status === "paused") return false;
  if (s.status === "overdue") return true;
  if (!s.due_date) return false;
  return new Date(s.due_date) < new Date();
};

const subtaskStyle = (s) => {
  if (s.done || s.status === "done") {
    return { border: "border-emerald-400/60", bg: "bg-emerald-500/10", accent: "text-emerald-300" };
  }
  if (s.status === "paused") {
    return { border: "border-yellow-400/60", bg: "bg-yellow-500/10", accent: "text-yellow-300" };
  }
  if (subIsOverdue(s)) {
    return { border: "border-rose-500/60", bg: "bg-rose-500/10", accent: "text-rose-300" };
  }
  return { border: "border-sertex-cyan/30", bg: "", accent: "text-sertex-cyan" };
};

export const SUBTASK_SIZE_KEY_PREFIX = "sertex_subtask_size_";

// ============ SUBTASK ROW (id-based, recursive, drag-and-drop) ============
// Her satır: kendi içeriği + (varsa) iç içe çocukları (SubtaskTree ile).
export function SubtaskRow({ sub, depth = 0, ctx }) {
  const controls = useDragControls();
  const {
    taskId, numbers, selectMode, selectedIds, highlight,
    onToggle, onOpenMenu, onSelectToggle,
    addChildParentId, newChildText, setNewChildText, commitAddChild, cancelAddChild,
  } = ctx;
  const sStyle = subtaskStyle(sub);
  const sOverdue = subIsOverdue(sub);
  const isDone = sub.done || sub.status === "done";
  const number = numbers[sub.id];
  const selected = selectedIds.has(sub.id);
  const hasChildren = Array.isArray(sub.children) && sub.children.length > 0;
  const rowRef = useRef(null);
  const persistTimer = useRef(null);
  const longPress = useRef(null);

  const [savedSize] = useState(() => {
    try {
      const raw = localStorage.getItem(SUBTASK_SIZE_KEY_PREFIX + sub.id);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.width || parsed.height)) return parsed;
      }
    } catch (e) { console.warn("[SubtaskRow] size read failed:", e); }
    return null;
  });

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const inlineW = el.style.width;
      const inlineH = el.style.height;
      if (!inlineW && !inlineH) return;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => {
        try {
          localStorage.setItem(SUBTASK_SIZE_KEY_PREFIX + sub.id, JSON.stringify(size));
        } catch (e) { console.warn("[SubtaskRow] size save failed:", e); }
      }, 250);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [sub.id]);

  const openMenuAt = (x, y) => onOpenMenu(sub.id, x, y);

  return (
    <Reorder.Item
      value={sub}
      dragListener={false}
      dragControls={controls}
      layout
      className="space-y-1"
      data-testid={`subtask-item-${taskId}-${sub.id}`}
    >
      <div
        ref={rowRef}
        style={{
          resize: "both",
          overflow: "auto",
          minHeight: 32,
          minWidth: 180,
          maxWidth: "100%",
          ...(savedSize?.width ? { width: savedSize.width } : {}),
          ...(savedSize?.height ? { height: savedSize.height } : {}),
        }}
        className={`subtask-resizable flex items-start gap-1.5 group/sub rounded px-1 py-0.5 border ${sStyle.border} ${sStyle.bg} transition-colors${selected ? " ring-1 ring-violet-400/70 bg-violet-500/10" : ""}`}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openMenuAt(e.clientX, e.clientY);
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          longPress.current = setTimeout(() => {
            openMenuAt(touch.clientX, touch.clientY);
            if (navigator.vibrate) navigator.vibrate(30);
          }, 500);
        }}
        onTouchEnd={() => clearTimeout(longPress.current)}
        onTouchMove={() => clearTimeout(longPress.current)}
        data-testid={`subtask-row-${taskId}-${sub.id}`}
      >
        <button
          onPointerDown={(e) => { e.preventDefault(); controls.start(e); }}
          data-testid={`subtask-drag-${taskId}-${sub.id}`}
          title="Sürükle sırala"
          aria-label="Sürükle sırala"
          className="opacity-30 group-hover/sub:opacity-100 focus:opacity-100 shrink-0 mt-0.5 h-4 w-3 flex items-center justify-center text-sertex-cyan/70 hover:text-sertex-cyan cursor-grab active:cursor-grabbing transition-opacity"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          onClick={() => onToggle(sub.id, !isDone)}
          data-testid={`subtask-check-${taskId}-${sub.id}`}
          className={`mt-0.5 h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
            isDone
              ? "border-emerald-400 bg-emerald-500/40"
              : sOverdue
              ? "border-rose-400 hover:bg-rose-500/10"
              : sub.status === "paused"
              ? "border-yellow-400 hover:bg-yellow-500/10"
              : "border-sertex-cyan/40 hover:border-sertex-cyan hover:bg-sertex-cyan/10"
          }`}
        >
          {isDone && <Check className="h-2.5 w-2.5 text-white" />}
        </button>
        <div
          className={`flex-1 min-w-0 ${selectMode ? "cursor-pointer" : ""}`}
          onClick={selectMode ? () => onSelectToggle(sub.id) : undefined}
        >
          {(sub.status === "paused" || sOverdue) && (
            <div className={`hud-text flex items-center gap-1 ${sStyle.accent}`}>
              {sub.status === "paused" ? (
                <><Pause className="h-2.5 w-2.5" /> BEKLEMEDE</>
              ) : (
                <><AlertTriangle className="h-2.5 w-2.5" /> SÜRESİ GEÇTİ</>
              )}
            </div>
          )}
          <span className={`text-xs font-mono ${isDone ? "text-sertex-textMuted line-through" : "text-sertex-text"}`}>
            {number != null && (
              <span
                className={`inline-flex items-center mr-1 tabular-nums font-semibold ${
                  isDone ? "text-sertex-textMuted"
                    : sOverdue ? "text-rose-300"
                    : sub.status === "paused" ? "text-yellow-300"
                    : sub.number_pinned ? "text-amber-300"
                    : "text-sertex-cyan"
                }`}
                data-testid={`subtask-number-${taskId}-${sub.id}`}
                title={sub.number_pinned ? "Sıra numarası sabit" : undefined}
              >
                {isDone ? "✓" : `${number}.`}
                {sub.number_pinned && !isDone && (
                  <Anchor className="h-2.5 w-2.5 ml-0.5 text-amber-300" data-testid={`subtask-number-pinned-${taskId}-${sub.id}`} />
                )}
              </span>
            )}
            <Highlight text={sub.text} query={highlight} />
            {hasChildren && (
              <span className="ml-1.5 text-[9px] text-violet-300/70 font-mono" title="İç içe alt görev sayısı">
                ↳ {sub.children.length}
              </span>
            )}
          </span>
          {sub.due_date && (
            <div className={`hud-text flex items-center gap-1 mt-0.5 ${sOverdue ? "text-rose-300" : sub.reminder_fired ? "text-sertex-textMuted" : "text-sertex-cyan"}`}>
              <Clock className="h-2.5 w-2.5" />
              {new Date(sub.due_date).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              {!isDone && (
                sub.reminder_fired ? (
                  <span title="Hatırlatma verildi" className="ml-1 opacity-70">🔔 ✓</span>
                ) : (
                  <Bell className="h-2.5 w-2.5 ml-1 opacity-70" title="Zamanı gelince hatırlatılacak" />
                )
              )}
            </div>
          )}
        </div>
        {selectMode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onSelectToggle(sub.id); }}
            data-testid={`subtask-select-${taskId}-${sub.id}`}
            title="Seç"
            aria-label="Seç"
            className={`shrink-0 h-5 w-5 flex items-center justify-center rounded-full border transition-all ${selected ? "border-violet-400 bg-violet-500/50 text-white" : "border-violet-400/50 text-violet-300 hover:bg-violet-500/15"}`}
          >
            {selected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMenuAt(rect.left - 200, rect.bottom + 4);
            }}
            data-testid={`subtask-menu-${taskId}-${sub.id}`}
            title="Alt görev menüsü"
            aria-label="Alt görev menüsü"
            className="opacity-0 group-hover/sub:opacity-100 focus:opacity-100 shrink-0 h-5 w-5 flex items-center justify-center border border-sertex-cyan/25 hover:border-sertex-cyan hover:bg-sertex-cyan/15 rounded text-sertex-cyan transition-all"
          >
            <MoreVertical className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* İç içe alt görev ekleme kutusu — menüden "Alt görev ekle" ile açılır */}
      {addChildParentId === sub.id && (
        <div className="ml-4 pl-1.5 border-l border-violet-400/25 flex items-center gap-1.5">
          <CornerDownRight className="h-3 w-3 text-violet-300 shrink-0" />
          <input
            value={newChildText}
            onChange={(e) => setNewChildText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newChildText.trim()) commitAddChild(sub.id);
              else if (e.key === "Escape") cancelAddChild();
            }}
            onBlur={() => commitAddChild(sub.id)}
            autoFocus
            placeholder="İç içe alt görev... (Enter: ekle · Esc: iptal)"
            data-testid={`subtask-addchild-input-${sub.id}`}
            className="flex-1 bg-transparent border-b border-violet-400/30 focus:border-violet-400 outline-none text-xs font-mono text-sertex-text placeholder:text-sertex-textMuted/60 pb-0.5"
          />
        </div>
      )}

      {/* Çocuklar — özyinelemeli, girintili (SubtaskTree ayrı dosyada) */}
      {hasChildren && (
        <div className="ml-4 pl-1.5 border-l border-sertex-cyan/15">
          <SubtaskTree nodes={sub.children} parentId={sub.id} depth={depth + 1} ctx={ctx} />
        </div>
      )}
    </Reorder.Item>
  );
}

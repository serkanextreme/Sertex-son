// Ana görev toplu işlem çubuğu (Detaylı + Kolay + Profesyonel ortak).
// Yalnızca sunum — durum/işlem mantığı useTaskBulk hook'unda.
import { Check, Pause, Play, AlertTriangle, Archive, Anchor, Trash2, X, ListChecks } from "lucide-react";

const BTN = "hud-text px-1.5 py-0.5 rounded border shrink-0 disabled:opacity-40 flex items-center gap-1 transition-colors";

export const TaskBulkBar = ({ count = 0, testPrefix = "task-bulk", onSelectAll, onClear, onCancel, onAction }) => {
  const dis = !count;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mb-2 p-1.5 rounded-md border border-violet-400/40 bg-violet-500/10"
      data-testid={`${testPrefix}-bar`}
    >
      <span className="hud-text text-violet-200 flex items-center gap-1 mr-1" data-testid={`${testPrefix}-count`}>
        <ListChecks className="h-3 w-3" /> {count} seçildi
      </span>
      <button onClick={onSelectAll} data-testid={`${testPrefix}-selectall`} className={`${BTN} border-violet-400/40 text-violet-200 hover:bg-violet-500/20`}>Tümünü Seç</button>
      <button onClick={onClear} data-testid={`${testPrefix}-clear`} className={`${BTN} border-white/15 text-sertex-textMuted hover:text-sertex-text`}>Temizle</button>
      <span className="w-px h-4 bg-white/10 mx-0.5" />
      <button disabled={dis} onClick={() => onAction("done")} data-testid={`${testPrefix}-done`} className={`${BTN} border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/15`}><Check className="h-3 w-3" /> Tamamla</button>
      <button disabled={dis} onClick={() => onAction("paused")} data-testid={`${testPrefix}-paused`} className={`${BTN} border-yellow-400/40 text-yellow-300 hover:bg-yellow-500/15`}><Pause className="h-3 w-3" /> Beklet</button>
      <button disabled={dis} onClick={() => onAction("pending")} data-testid={`${testPrefix}-pending`} className={`${BTN} border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10`}><Play className="h-3 w-3" /> Aktif</button>
      <button disabled={dis} onClick={() => onAction("overdue")} data-testid={`${testPrefix}-overdue`} className={`${BTN} border-rose-400/40 text-rose-300 hover:bg-rose-500/15`}><AlertTriangle className="h-3 w-3" /> Tarihi geçti</button>
      <button disabled={dis} onClick={() => onAction("archive")} data-testid={`${testPrefix}-archive`} className={`${BTN} border-sertex-cyan/40 text-sertex-cyan hover:bg-sertex-cyan/10`}><Archive className="h-3 w-3" /> Arşivle</button>
      <button disabled={dis} onClick={() => onAction("pin")} data-testid={`${testPrefix}-pin`} className={`${BTN} border-amber-400/40 text-amber-300 hover:bg-amber-500/15`}><Anchor className="h-3 w-3" /> Sabitle</button>
      <button disabled={dis} onClick={() => onAction("unpin")} data-testid={`${testPrefix}-unpin`} className={`${BTN} border-white/15 text-sertex-textMuted hover:text-amber-200`}><Anchor className="h-3 w-3" /> Sabiti kaldır</button>
      <button disabled={dis} onClick={() => onAction("delete")} data-testid={`${testPrefix}-delete`} className={`${BTN} border-rose-400/40 text-rose-300 hover:bg-rose-500/15`}><Trash2 className="h-3 w-3" /> Sil</button>
      <button onClick={onCancel} data-testid={`${testPrefix}-cancel`} className={`${BTN} border-white/15 text-sertex-textMuted hover:text-sertex-text ml-auto`}><X className="h-3 w-3" /> Vazgeç</button>
    </div>
  );
};

export default TaskBulkBar;

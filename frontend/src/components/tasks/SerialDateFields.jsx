import React from "react";
import { Check, Hash } from "lucide-react";

// Görev formunda "Seri No" + "Tarih" kutucukları (Yeni Görev + Görevi Düzenle ortak).
// Kontrollü bileşen — durum parent'ta tutulur.
//   assignSerial / showDate : checkbox durumları
//   currentSerial           : mevcut seri no (edit) veya null
//   allowOverride + isSuper  : süper yönetici seri no'yu elle değiştirebilir (edit)
//   serialOverride           : elle girilen numara (string) veya ""
export const SerialDateFields = ({
  testPrefix = "task",
  assignSerial,
  setAssignSerial,
  showDate,
  setShowDate,
  currentSerial = null,
  allowOverride = false,
  isSuper = false,
  serialOverride = "",
  setSerialOverride,
}) => {
  const box = (checked) =>
    `h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
      checked ? "bg-sertex-cyan/25 border-sertex-cyan" : "border-sertex-cyan/40"
    }`;
  return (
    <div
      className="rounded-lg border border-sertex-cyan/25 bg-sertex-surface/40 p-3 space-y-2"
      data-testid={`${testPrefix}-serialdate`}
    >
      <div className="hud-text text-sertex-textMuted flex items-center gap-1">
        <Hash className="h-3 w-3" /> TAKİP ETİKETİ
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setAssignSerial(!assignSerial)}
          data-testid={`${testPrefix}-serial-check`}
          className="flex items-center gap-2 text-sm text-sertex-text font-mono"
        >
          <span className={box(assignSerial)}>
            {assignSerial && <Check className="h-2.5 w-2.5 text-sertex-cyan" />}
          </span>
          Seri No
        </button>
        <button
          type="button"
          onClick={() => setShowDate(!showDate)}
          data-testid={`${testPrefix}-date-check`}
          className="flex items-center gap-2 text-sm text-sertex-text font-mono"
        >
          <span className={box(showDate)}>
            {showDate && <Check className="h-2.5 w-2.5 text-sertex-cyan" />}
          </span>
          Tarih
        </button>
      </div>
      {assignSerial && (
        <div className="flex items-center gap-2 text-xs font-mono pt-0.5">
          {allowOverride && isSuper ? (
            <>
              <span className="text-sertex-textMuted">Seri No:</span>
              <input
                type="number"
                min="1"
                value={serialOverride}
                onChange={(e) => setSerialOverride && setSerialOverride(e.target.value)}
                placeholder={currentSerial != null ? String(currentSerial) : "otomatik"}
                data-testid={`${testPrefix}-serial-input`}
                className="w-24 px-2 py-1 rounded bg-sertex-surface/60 border border-sertex-cyan/25 text-sertex-text focus:border-sertex-cyan outline-none"
              />
              <span className="text-sertex-textMuted/70">boş = otomatik/sıradaki</span>
            </>
          ) : (
            <span className="text-sertex-textMuted">
              {currentSerial != null
                ? `Seri No: ${currentSerial}`
                : "Otomatik sıradaki numara atanacak"}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default SerialDateFields;

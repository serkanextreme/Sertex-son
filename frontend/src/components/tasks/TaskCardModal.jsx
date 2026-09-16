// Tam görev kartını (koyu TaskCard) modal içinde açar. Teknik ve Aydınlık
// arayüzleri bir göreve tıklayınca bunu kullanır: beyaz/terminal listenin
// üzerinde, tüm gelişmiş özellikleriyle (alt görevler, promote, kilit, menü)
// koyu görev kartı belirir.
import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { TaskCard } from "../TaskCard";

export const TaskCardModal = ({ cardProps, onClose }) => {
  if (!cardProps) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[105] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
      data-testid="taskcard-modal-overlay"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl my-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="taskcard-modal"
      >
        <button
          type="button"
          onClick={onClose}
          data-testid="taskcard-modal-close"
          aria-label="Kapat"
          className="absolute -top-3 -right-3 z-10 h-8 w-8 flex items-center justify-center rounded-full bg-sertex-surface border border-sertex-cyan/50 text-sertex-cyan hover:bg-sertex-cyan/20 shadow-lg"
        >
          <X className="h-4 w-4" />
        </button>
        <TaskCard {...cardProps} />
      </motion.div>
    </div>,
    document.body,
  );
};

export default TaskCardModal;

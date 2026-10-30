"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { AutoScheduleBox } from "@/components/content/auto-schedule-box";

interface CadenceSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  blogId?: string; // blog do filtro do topo do Calendário
}

export function CadenceSchedulerModal({ isOpen, onClose, blogId }: CadenceSchedulerModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Planejar Calendário de Publicação"
      description="Defina o período, as categorias e o limite de artigos por dia. O sistema organiza os artigos aprovados sem data."
      className="max-w-4xl"
    >
      <AutoScheduleBox blogId={blogId ?? ""} />
    </Modal>
  );
}

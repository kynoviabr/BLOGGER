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
      title="Programar artigos aprovados"
      description="Programe apenas os artigos aprovados e sem data de publicação: escolha o período, as categorias, o limite por dia e os horários."
      className="max-w-4xl"
    >
      <AutoScheduleBox blogId={blogId ?? ""} />
    </Modal>
  );
}

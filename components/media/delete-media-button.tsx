"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { deleteMediaAction } from "@/app/actions/media";

export function DeleteMediaButton({ id }: { id: string }) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Excluir este asset da Galeria de Mídia? Esta ação não pode ser desfeita.")) return;
    setPending(true);
    try {
      await deleteMediaAction(id);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={pending}
      aria-label="Excluir asset"
      title="Excluir asset"
      className="inline-flex h-8 w-8 items-center justify-center rounded-brand-btn border border-destructive/25 bg-[hsl(var(--danger-bg))] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}

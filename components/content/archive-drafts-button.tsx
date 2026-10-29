"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveDraftsAction } from "@/app/actions/content";

interface ArchiveDraftsButtonProps {
  ids: string[];
}

/** Tira da lista os rascunhos exibidos. Eles continuam na aba "Arquivados". */
export function ArchiveDraftsButton({ ids }: ArchiveDraftsButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    const confirmed = window.confirm(
      `Arquivar ${ids.length} rascunho(s)? Eles saem desta lista e ficam na aba "Arquivados", de onde podem ser recuperados.`
    );
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await archiveDraftsAction(ids);
      if (!result.success) {
        setError(result.error || "Não foi possível arquivar os rascunhos.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleClick} disabled={isPending || ids.length === 0}>
        {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Archive className="mr-1.5 h-3.5 w-3.5" />}
        Arquivar {ids.length} rascunho(s)
      </Button>
    </div>
  );
}

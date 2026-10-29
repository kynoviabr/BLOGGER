"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveContentAction } from "@/app/actions/content";

interface ApproveReviewedButtonProps {
  ids: string[];
}

/** Aprova em massa os artigos em revisão que já têm data no calendário. */
export function ApproveReviewedButton({ ids }: ApproveReviewedButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleClick = () => {
    const confirmed = window.confirm(
      `Aprovar ${ids.length} artigo(s)? Cada um será publicado na data que está no calendário.`
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await approveContentAction(ids);
      if (!result.success) {
        setMessage(result.error || "Não foi possível aprovar.");
        return;
      }
      const parts = [`${result.approved} aprovado(s)`];
      if (result.late.length) parts.push(`${result.late.length} com a data vencida (escolha uma nova data no artigo)`);
      if (result.needsDate.length) parts.push(`${result.needsDate.length} sem data (agende no artigo)`);
      if (result.failed.length) parts.push(`${result.failed.length} com erro: ${result.failed[0].error}`);
      setMessage(parts.join(", ") + ".");
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
      <Button
        size="sm"
        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        onClick={handleClick}
        disabled={isPending || ids.length === 0}
      >
        {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
        Aprovar {ids.length} com data marcada
      </Button>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle, Clock, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { deleteReviewedContentAction, sendReviewedToCalendarAction } from "@/app/actions/content";
import { ContentItemWithRelations } from "@/types/content";

const SELECTABLE_STATUSES = ["reviewing", "draft"];

function Checkbox({
  checked,
  onCheckedChange,
  disabled,
  ...rest
}: {
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onCheckedChange}
      disabled={disabled}
      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40"
      {...rest}
    />
  );
}

/** Tabela de artigos com seleção para enviar ao Calendário sem data. */
export function ContentSelectTable({ items: rawItems }: { items: ContentItemWithRelations[] }) {
  // Ordem de data crescente; itens sem data vão para o fim, na ordem original.
  const items = useMemo(() => {
    const time = (item: ContentItemWithRelations) => {
      const at = item.editorial_calendar?.scheduled_at;
      return at ? new Date(at).getTime() : Number.POSITIVE_INFINITY;
    };
    return [...rawItems].sort((a, b) => time(a) - time(b));
  }, [rawItems]);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const selectable = useMemo(
    () => items.filter((item) => SELECTABLE_STATUSES.includes(item.status) && item.body?.trim()).map((item) => item.id),
    [items]
  );
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable));

  const handleDelete = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `Excluir ${ids.length} artigo(s)? Eles vão para Arquivados e podem ser recuperados de lá. Nada publicado é afetado.`
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await deleteReviewedContentAction(ids);
      if (!result.success) {
        setMessage(result.error || "Não foi possível excluir os artigos.");
        return;
      }
      setSelected(new Set());
      setMessage(`${result.count} artigo(s) excluído(s) para Arquivados.`);
      router.refresh();
    });
  };

  const handleSend = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `Enviar ${ids.length} artigo(s) para o Calendário sem data? Eles ficam aprovados e a data é escolhida depois. Nada é publicado agora.`
    );
    if (!confirmed) return;
    setMessage(null);
    startTransition(async () => {
      const result = await sendReviewedToCalendarAction(ids);
      if (!result.success) {
        setMessage(result.error || "Não foi possível enviar ao calendário.");
        return;
      }
      setSelected(new Set());
      setMessage(`${result.count} enviado(s) ao Calendário${result.skipped ? `, ${result.skipped} ignorado(s)` : ""}.`);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={selectable.length === 0} aria-label="Selecionar todos" />
            Selecionar todos ({selectable.length})
          </label>
          {message && <span>{message}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={isPending || selected.size === 0}
            className="gap-1.5 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir {selected.size}
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={isPending || selected.size === 0}
            className="gap-1.5"
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar {selected.size} para o Calendário
        </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Título do Artigo</TableHead>
              <TableHead>Blog</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Idioma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Publicação</TableHead>
              <TableHead>Última Edição</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const canSelect = selectable.includes(item.id);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(item.id)}
                      onCheckedChange={() => toggle(item.id)}
                      disabled={!canSelect}
                      aria-label={`Selecionar ${item.title}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium max-w-md">
                    <Link href={`/content/${item.id}`} className="text-foreground hover:text-primary dark:hover:text-blue-400 block truncate">
                      {item.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">/{item.slug}</span>
                      {item.focus_keyword && (
                        <span className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          🎯 {item.focus_keyword}
                        </span>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          #{item.tags.length} {item.tags.length === 1 ? "tag" : "tags"}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">{item.blog?.name || "Blog"}</TableCell>
                  <TableCell className="text-xs text-foreground">{item.editorial_calendar?.category?.name || "—"}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{item.language}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} errorMessage={item.last_publish_error} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {item.published_at ? (
                      <div className="flex items-center gap-1.5 text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {formatDate(item.published_at)}
                      </div>
                    ) : item.editorial_calendar?.scheduled_at ? (
                      item.status === "scheduled" || item.status === "ready" ? (
                        <div className="flex items-center gap-1.5 text-foreground">
                          <CalendarClock className="h-3.5 w-3.5 text-primary" />
                          {formatDate(item.editorial_calendar.scheduled_at)}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400" title="Sem aprovação, o artigo não é publicado nesta data.">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {formatDate(item.editorial_calendar.scheduled_at)} · falta aprovar
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        Não publicado
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(item.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/content/${item.id}`}>
                      <Button variant="outline" size="sm" className="text-xs">Editar</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

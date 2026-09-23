"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { CalendarItemWithRelations, CalendarStatus } from "@/types/calendar";

interface CalendarTableViewProps {
  initialItems: CalendarItemWithRelations[];
}

export function CalendarTableView({ initialItems }: CalendarTableViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItemWithRelations[]>(initialItems);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
    wpUrl?: string;
  } | null>(null);

  const handleExecuteNow = async (item: CalendarItemWithRelations) => {
    setRunningId(item.id);
    setNotification(null);

    try {
      const res = await fetch(`/api/calendar/${item.id}/execute`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao executar pipeline da pauta.");
      }

      // Atualiza o status do item na tabela para PUBLISHED
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "PUBLISHED" as CalendarStatus } : it
        )
      );

      setNotification({
        type: "success",
        message: `Pipeline executado com sucesso! Artigo publicado no WordPress: "${item.proposed_title || item.topic}"`,
        wpUrl: data.data?.wpUrl,
      });

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao processar pipeline.";
      setNotification({
        type: "error",
        message: msg,
      });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast / Alerta de Notificação */}
      {notification && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs ${
            notification.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            )}
            <div>
              <span className="font-semibold block">{notification.message}</span>
              {notification.wpUrl && (
                <a
                  href={notification.wpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Ver Artigo Publicado no WordPress
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pauta & Título Proposto</TableHead>
            <TableHead>Blog / Idioma</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Agendamento</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const isRunning = runningId === item.id;
            const canExecute = item.status === "PLANNED" || item.status === "READY";

            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium max-w-sm">
                  <Link
                    href={`/calendar/${item.id}`}
                    className="text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 block truncate"
                  >
                    {item.proposed_title || item.topic}
                  </Link>
                  <span className="text-xs text-slate-400 block truncate mt-0.5">
                    Tema: {item.topic}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200 block">
                    {item.blog?.name || "Blog"}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {item.language}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                  {item.category?.name || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      item.priority === "high"
                        ? "error"
                        : item.priority === "medium"
                        ? "warning"
                        : "default"
                    }
                  >
                    {item.priority.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                    {formatDate(item.scheduled_at)}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={item.status} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Botão Executar Agora (visível para PLANNED e READY) */}
                    {canExecute && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleExecuteNow(item)}
                        disabled={isRunning || runningId !== null}
                        className="h-8 px-2.5 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
                        title="Executar pipeline completo agora (Gerar Artigo -> Gerar Imagem -> Publicar no WordPress)"
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            A processar...
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3.5 w-3.5 fill-current" />
                            Executar Agora
                          </>
                        )}
                      </Button>
                    )}

                    <Link href={`/calendar/${item.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs">
                        Editar
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

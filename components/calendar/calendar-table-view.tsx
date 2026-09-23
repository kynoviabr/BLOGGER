"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  CheckSquare,
  Square,
  MinusSquare,
  Clock,
  SquareX,
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

interface QueueProgress {
  current: number;
  total: number;
  currentTitle: string;
  countdownSeconds?: number;
}

export function CalendarTableView({ initialItems }: CalendarTableViewProps) {
  const router = useRouter();
  const [items, setItems] = useState<CalendarItemWithRelations[]>(initialItems);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runningId, setRunningId] = useState<string | null>(null);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [queueProgress, setQueueProgress] = useState<QueueProgress | null>(null);
  const stopQueueRef = useRef(false);

  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
    wpUrl?: string;
  } | null>(null);

  // Sincroniza items quando initialItems mudar
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const failedItems = items.filter((it) => it.status === "FAILED");
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((it) => it.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const sleepWithCountdown = async (seconds: number, currentProgress: QueueProgress) => {
    for (let s = seconds; s > 0; s--) {
      if (stopQueueRef.current) break;
      setQueueProgress({ ...currentProgress, countdownSeconds: s });
      await new Promise((r) => setTimeout(r, 1000));
    }
  };

  // Processa fila com delay crítico de 18 segundos entre pautas
  const processQueue = async (idsToProcess: string[]) => {
    if (idsToProcess.length === 0) return;

    setIsProcessingQueue(true);
    stopQueueRef.current = false;
    setNotification(null);

    let successCount = 0;
    let failureCount = 0;
    const total = idsToProcess.length;

    for (let i = 0; i < total; i++) {
      if (stopQueueRef.current) {
        setNotification({
          type: "info",
          message: `Fila interrompida pelo usuário. (${successCount} processadas com sucesso, ${total - i} canceladas).`,
        });
        break;
      }

      const currentId = idsToProcess[i];
      const targetItem = items.find((it) => it.id === currentId);
      const title = targetItem?.proposed_title || targetItem?.topic || currentId;

      setRunningId(currentId);
      const currentProgress: QueueProgress = {
        current: i + 1,
        total,
        currentTitle: title,
      };
      setQueueProgress(currentProgress);

      try {
        const res = await fetch(`/api/calendar/${currentId}/execute`, {
          method: "POST",
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Falha ao executar pipeline.");
        }

        successCount++;
        setItems((prev) =>
          prev.map((it) =>
            it.id === currentId
              ? { ...it, status: "PUBLISHED" as CalendarStatus, last_error: null }
              : it
          )
        );
      } catch (err: unknown) {
        failureCount++;
        const errMsg = err instanceof Error ? err.message : "Erro no pipeline.";
        setItems((prev) =>
          prev.map((it) =>
            it.id === currentId
              ? { ...it, status: "FAILED" as CalendarStatus, last_error: errMsg }
              : it
          )
        );
      }

      // Se houver próximas pautas na fila e não tiver sido cancelado, aguarda 18 segundos para respeitar cota
      if (i < total - 1 && !stopQueueRef.current) {
        await sleepWithCountdown(18, currentProgress);
      }
    }

    setRunningId(null);
    setQueueProgress(null);
    setIsProcessingQueue(false);
    setSelectedIds(new Set());

    if (!stopQueueRef.current) {
      if (failureCount === 0) {
        setNotification({
          type: "success",
          message: `Processamento em lote finalizado com sucesso! Todas as ${successCount} pautas foram publicadas no WordPress.`,
        });
      } else {
        setNotification({
          type: "error",
          message: `Processamento em lote finalizado: ${successCount} pautas publicadas com sucesso e ${failureCount} com falha (consulte o tooltip de erro).`,
        });
      }
    }

    router.refresh();
  };

  const handleExecuteSelected = () => {
    const ids = Array.from(selectedIds);
    processQueue(ids);
  };

  const handleReprocessFailed = () => {
    const failedIds = failedItems.map((it) => it.id);
    setSelectedIds(new Set(failedIds));
    processQueue(failedIds);
  };

  const handleStopQueue = () => {
    stopQueueRef.current = true;
  };

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

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "PUBLISHED" as CalendarStatus, last_error: null } : it
        )
      );

      setNotification({
        type: "success",
        message: `Pipeline executado com sucesso! Artigo publicado no WordPress: "${item.proposed_title || item.topic}"`,
        wpUrl: data.data?.wpUrl,
      });

      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao processar pipeline.";
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "FAILED" as CalendarStatus, last_error: msg } : it
        )
      );
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
              : notification.type === "info"
              ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-300"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : notification.type === "info" ? (
              <Clock className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
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

      {/* Painel de Progresso da Fila em Lote */}
      {isProcessingQueue && queueProgress && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <span>
                Processando Lote: {queueProgress.current} de {queueProgress.total} pautas
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStopQueue}
              className="h-7 text-xs border-rose-200 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300"
            >
              <SquareX className="mr-1 h-3.5 w-3.5" />
              Parar Fila
            </Button>
          </div>

          <div className="text-[11px] text-slate-600 dark:text-slate-300 flex items-center justify-between">
            <span className="truncate max-w-md">
              Pauta atual: <strong>{queueProgress.currentTitle}</strong>
            </span>
            {queueProgress.countdownSeconds !== undefined && queueProgress.countdownSeconds > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/60">
                <Clock className="h-3 w-3 animate-pulse" />
                Delay anti rate-limit: {queueProgress.countdownSeconds}s para próxima pauta
              </span>
            )}
          </div>

          {/* Barra de Progresso */}
          <div className="w-full bg-blue-200/60 dark:bg-blue-900/40 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all duration-300 rounded-full"
              style={{
                width: `${((queueProgress.current - 1) / queueProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Barra de Ações Rápidas & Ações em Lote */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {selectedIds.size} pauta(s) selecionada(s)
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleExecuteSelected}
                disabled={isProcessingQueue}
                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Executar Selecionados ({selectedIds.size})
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                disabled={isProcessingQueue}
                className="h-8 text-xs text-slate-500 hover:text-slate-800"
              >
                Desmarcar
              </Button>
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">
              Selecione checkboxes para ações em lote ou execute pautas individualmente.
            </span>
          )}
        </div>

        {/* Botão Reprocessar Falhas */}
        {failedItems.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReprocessFailed}
            disabled={isProcessingQueue}
            className="h-8 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
            title="Selecionar e executar novamente todas as pautas com status FAILED"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reprocessar Falhas ({failedItems.length})
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {/* Coluna Checkbox Selecionar Todos */}
            <TableHead className="w-10">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                disabled={isProcessingQueue || items.length === 0}
                className="p-1 hover:text-blue-600 text-slate-400 dark:text-slate-500 transition-colors"
                title={isAllSelected ? "Desmarcar todos" : "Selecionar todos"}
              >
                {isAllSelected ? (
                  <CheckSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ) : isSomeSelected ? (
                  <MinusSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>
            </TableHead>
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
            const isSelected = selectedIds.has(item.id);
            const canExecute = item.status === "PLANNED" || item.status === "READY" || item.status === "FAILED";

            return (
              <TableRow
                key={item.id}
                className={isSelected ? "bg-blue-50/40 dark:bg-blue-950/20" : undefined}
              >
                {/* Coluna Checkbox da Linha */}
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectOne(item.id)}
                    disabled={isProcessingQueue}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </TableCell>
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
                  {/* StatusBadge com tooltip de erro em hover se status for FAILED */}
                  <StatusBadge status={item.status} errorMessage={item.last_error} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Botão Executar Agora (visível para PLANNED, READY e FAILED) */}
                    {canExecute && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleExecuteNow(item)}
                        disabled={isRunning || runningId !== null || isProcessingQueue}
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
                            {item.status === "FAILED" ? "Reprocessar" : "Executar"}
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

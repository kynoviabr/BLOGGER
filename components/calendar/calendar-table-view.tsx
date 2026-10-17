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
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { SUPPORTED_LANGUAGES, getLanguageConfig } from "@/config/languages";
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
  const [executingItem, setExecutingItem] = useState<CalendarItemWithRelations | null>(null);
  const [executionLanguage, setExecutionLanguage] = useState<string>("pt-BR");
  const [executionImageMode, setExecutionImageMode] = useState<"auto" | "inspect">("inspect");
  const [inspectingItem, setInspectingItem] = useState<{
    calendarId: string;
    contentId?: string;
    title: string;
    imageUrl?: string;
    altText?: string;
  } | null>(null);
  const [isRegeneratingImage, setIsRegeneratingImage] = useState(false);
  const [customImageAdjustment, setCustomImageAdjustment] = useState("");
  const [isPublishingInspected, setIsPublishingInspected] = useState(false);
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

  const handleExecuteNow = (item: CalendarItemWithRelations) => {
    setExecutingItem(item);
    setExecutionLanguage(item.language || "pt-BR");
  };

  const confirmExecuteNow = async () => {
    if (!executingItem) return;
    const item = executingItem;
    const lang = executionLanguage;
    const mode = executionImageMode;
    setExecutingItem(null);
    setRunningId(item.id);
    setNotification(null);

    try {
      const res = await fetch(`/api/calendar/${item.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, imageMode: mode }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao executar pipeline da pauta.");
      }

      // Se estiver em modo INSPECT e requerer aprovação da imagem
      if (data.data?.requiresApproval) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, status: "READY" as CalendarStatus, language: lang, last_error: null } : it
          )
        );
        setInspectingItem({
          calendarId: item.id,
          contentId: data.data.contentId,
          title: item.proposed_title || item.topic,
          imageUrl: data.data.imageUrl,
          altText: data.data.altText,
        });
        setNotification({
          type: "info",
          message: `Artigo e imagem gerados com sucesso! Pauta em modo INSPECT: avalie e aprove a imagem abaixo para publicar no WordPress.`,
        });
        return;
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "PUBLISHED" as CalendarStatus, language: lang, last_error: null } : it
        )
      );

      const langInfo = getLanguageConfig(lang);
      setNotification({
        type: "success",
        message: `Pipeline executado com sucesso em ${langInfo.name} (${langInfo.flag})! Artigo publicado no WordPress: "${item.proposed_title || item.topic}"`,
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

  const handleApproveAndPublish = async () => {
    if (!inspectingItem) return;
    setIsPublishingInspected(true);
    try {
      const res = await fetch(`/api/calendar/${inspectingItem.calendarId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipInspection: true, language: executionLanguage }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao publicar no WordPress.");
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === inspectingItem.calendarId
            ? { ...it, status: "PUBLISHED" as CalendarStatus, last_error: null }
            : it
        )
      );
      setNotification({
        type: "success",
        message: `Imagem aprovada e artigo publicado no WordPress com sucesso!`,
        wpUrl: data.data?.wpUrl,
      });
      setInspectingItem(null);
      router.refresh();
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao publicar no WordPress.",
      });
    } finally {
      setIsPublishingInspected(false);
    }
  };

  const handleRegenerateImage = async () => {
    if (!inspectingItem?.contentId) return;
    setIsRegeneratingImage(true);
    try {
      const res = await fetch(`/api/content/${inspectingItem.contentId}/image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customAdjustment: customImageAdjustment }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao regerar imagem.");
      }
      setInspectingItem((prev) =>
        prev
          ? {
              ...prev,
              imageUrl: data.mediaAsset?.public_url || prev.imageUrl,
              altText: data.mediaAsset?.alt_text || prev.altText,
            }
          : null
      );
      setNotification({
        type: "success",
        message: "Nova imagem gerada com sucesso! Avalie o resultado no modal.",
      });
      setCustomImageAdjustment("");
    } catch (err: unknown) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao regerar imagem.",
      });
    } finally {
      setIsRegeneratingImage(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast / Alerta de Notificação */}
      {notification && (
        <div
          className={`flex items-start justify-between gap-3 rounded-brand-card border p-4 text-xs ${
            notification.type === "success"
              ? "border-success/30 bg-[hsl(var(--success-bg))] text-success"
              : notification.type === "info"
              ? "border-primary/30 bg-[hsl(var(--info-bg))] text-info"
              : "border-destructive/30 bg-[hsl(var(--danger-bg))] text-destructive "
          }`}
        >
          <div className="flex items-start gap-2.5">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
            ) : notification.type === "info" ? (
              <Clock className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
            )}
            <div>
              <span className="font-semibold block">{notification.message}</span>
              {notification.wpUrl && (
                <a
                  href={notification.wpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline "
                >
                  Ver Artigo Publicado no WordPress
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-[hsl(var(--text-muted))] hover:text-foreground"
          >
            ✕
          </button>
        </div>
      )}

      {/* Painel de Progresso da Fila em Lote */}
      {isProcessingQueue && queueProgress && (
        <div className="rounded-brand-card border border-primary/25 bg-[hsl(var(--info-bg))] p-4 text-xs text-info shadow-card space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <Loader2 className="h-4 w-4 animate-spin text-primary " />
              <span>
                Processando Lote: {queueProgress.current} de {queueProgress.total} pautas
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleStopQueue}
              className="h-7 text-xs border-destructive/30 text-destructive hover:bg-[hsl(var(--danger-bg))]"
            >
              <SquareX className="mr-1 h-3.5 w-3.5" />
              Parar Fila
            </Button>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between">
            <span className="truncate max-w-md">
              Pauta atual: <strong>{queueProgress.currentTitle}</strong>
            </span>
            {queueProgress.countdownSeconds !== undefined && queueProgress.countdownSeconds > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-warning bg-[hsl(var(--warning-bg))] px-2 py-0.5 rounded border border-warning/30">
                <Clock className="h-3 w-3 animate-pulse" />
                Delay anti rate-limit: {queueProgress.countdownSeconds}s para próxima pauta
              </span>
            )}
          </div>

          {/* Barra de Progresso */}
          <div className="w-full bg-primary/15 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-2 transition-all duration-300 rounded-full"
              style={{
                width: `${((queueProgress.current - 1) / queueProgress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Barra de Ações Rápidas & Ações em Lote */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card p-3 rounded-brand-card border border-border shadow-card  text-xs">
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">
                {selectedIds.size} pauta(s) selecionada(s)
              </span>
              <Button
                type="button"
                size="sm"
                onClick={handleExecuteSelected}
                disabled={isProcessingQueue}
                className="h-8 gap-1.5 bg-success hover:brightness-95 text-white font-semibold shadow-sm"
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
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Desmarcar
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground">
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
            className="h-8 gap-1.5 border-destructive/30 text-destructive hover:bg-[hsl(var(--danger-bg))]"
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
                className="p-1 hover:text-primary text-[hsl(var(--text-muted))]  transition-colors"
                title={isAllSelected ? "Desmarcar todos" : "Selecionar todos"}
              >
                {isAllSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary " />
                ) : isSomeSelected ? (
                  <MinusSquare className="h-4 w-4 text-primary " />
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
                className={isSelected ? "bg-[hsl(var(--primary-light))] " : undefined}
              >
                {/* Coluna Checkbox da Linha */}
                <TableCell className="w-10">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelectOne(item.id)}
                    disabled={isProcessingQueue}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-ring cursor-pointer"
                  />
                </TableCell>
                <TableCell className="font-medium max-w-sm">
                  <Link
                    href={`/calendar/${item.id}`}
                    className="text-foreground hover:text-primary  block truncate"
                  >
                    {item.proposed_title || item.topic}
                  </Link>
                  <span className="text-xs text-[hsl(var(--text-muted))] block truncate mt-0.5">
                    Tema: {item.topic}
                  </span>
                </TableCell>
                <TableCell className="text-xs">
                  <span className="font-medium text-foreground block">
                    {item.blog?.name || "Blog"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--text-muted))] text-[11px] font-medium mt-0.5">
                    <span>{getLanguageConfig(item.language).flag}</span>
                    <span>{getLanguageConfig(item.language).name}</span>
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
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
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5 text-[hsl(var(--text-muted))]" />
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
                        className="h-8 px-2.5 text-xs bg-success text-white hover:brightness-95 border-success font-semibold shadow-sm"
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

      {/* Modal de Confirmação de Idioma para Execução do Pipeline */}
      <Modal
        isOpen={executingItem !== null}
        onClose={() => setExecutingItem(null)}
        title="Confirmar Execução do Pipeline Editorial"
        description="Confirme o idioma para produção do artigo, pesquisa factual, geração de imagem e publicação no WordPress."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700 text-xs space-y-1">
            <div className="text-slate-500 font-medium">Pauta Selecionada:</div>
            <div className="text-slate-900 dark:text-slate-100 font-semibold text-sm">
              {executingItem?.proposed_title || executingItem?.topic}
            </div>
            {executingItem?.blog && (
              <div className="text-slate-500 text-[11px] pt-1">
                Blog: <span className="font-medium text-slate-700 dark:text-slate-300">{executingItem.blog.name}</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Idioma do Artigo *
            </label>
            <Select
              value={executionLanguage}
              onChange={(e) => setExecutionLanguage(e.target.value)}
              disabled={runningId !== null}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.name} ({lang.code})
                </option>
              ))}
            </Select>
            <p className="text-[11px] text-slate-500">
              A redação, auditoria factual, estilo visual da imagem e avisos legais serão produzidos no idioma selecionado.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Modo de Geração de Imagem *
            </label>
            <Select
              value={executionImageMode}
              onChange={(e) => setExecutionImageMode(e.target.value as "auto" | "inspect")}
              disabled={runningId !== null}
            >
              <option value="inspect">👁️ Modo INSPECT (Pausar e inspecionar imagem antes de publicar)</option>
              <option value="auto">⚡ Modo AUTO (Gerar imagem e publicar direto no WordPress)</option>
            </Select>
            <p className="text-[11px] text-slate-500">
              {executionImageMode === "inspect"
                ? "O artigo e imagem serão gerados, mas a publicação no WordPress aguardará a sua aprovação visual."
                : "O pipeline rodará 100% autônomo e publicará o artigo e a imagem automaticamente."}
            </p>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setExecutingItem(null)}
              disabled={runningId !== null}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmExecuteNow}
              disabled={runningId !== null}
              className="gap-1.5 bg-success text-white hover:brightness-95"
            >
              <Play className="h-4 w-4 fill-current" />
              Confirmar e Executar Pipeline
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de Inspeção e Aprovação de Imagem (Modo INSPECT) */}
      <Modal
        isOpen={inspectingItem !== null}
        onClose={() => setInspectingItem(null)}
        title="Inspeção de Imagem: Aprovar para Publicação"
        description="Avalie a imagem gerada para o artigo antes de enviar ao WordPress."
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 dark:bg-slate-800/40 dark:border-slate-700 text-xs">
            <span className="text-slate-500 block text-[11px] uppercase font-semibold">Artigo Pronto:</span>
            <span className="text-slate-900 dark:text-slate-100 font-semibold text-sm block mt-0.5">
              {inspectingItem?.title}
            </span>
          </div>

          {/* Preview da Imagem Gerada em 16:9 */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
              Imagem de Destaque Gerada (16:9):
            </span>
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black/10 flex items-center justify-center">
              {inspectingItem?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={inspectingItem.imageUrl}
                  alt={inspectingItem.altText || inspectingItem.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 p-6 text-muted-foreground text-xs">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span>Carregando preview da imagem...</span>
                </div>
              )}
            </div>
            {inspectingItem?.altText && (
              <p className="text-[11px] text-muted-foreground italic">
                <span className="font-semibold not-italic">Alt Text:</span> {inspectingItem.altText}
              </p>
            )}
          </div>

          {/* Ajuste Opcional para Refazer Imagem */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Instrução de Ajuste para Refazer (Opcional):</span>
              <span className="text-[10px] text-muted-foreground">Ex: &quot;iluminação mais quente&quot;, &quot;foco em balança&quot;</span>
            </label>
            <input
              type="text"
              value={customImageAdjustment}
              onChange={(e) => setCustomImageAdjustment(e.target.value)}
              placeholder="Digite o que deseja mudar na imagem se quiser refazer..."
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              disabled={isRegeneratingImage || isPublishingInspected}
            />
          </div>

          {/* Botões de Ação */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRegenerateImage}
              disabled={isRegeneratingImage || isPublishingInspected}
              className="gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 text-xs"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isRegeneratingImage ? "animate-spin" : ""}`} />
              {isRegeneratingImage ? "Regerando Imagem..." : "Refazer Imagem"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setInspectingItem(null)}
                disabled={isPublishingInspected || isRegeneratingImage}
                className="text-xs"
              >
                Decidir Depois
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApproveAndPublish}
                disabled={isPublishingInspected || isRegeneratingImage}
                className="gap-1.5 bg-success text-white hover:brightness-95 text-xs font-semibold shadow-sm"
              >
                <CheckCircle2 className={`h-3.5 w-3.5 ${isPublishingInspected ? "animate-spin" : ""}`} />
                {isPublishingInspected ? "Publicando no WordPress..." : "Aprovar & Publicar no WordPress"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  Play,
  Loader2,
  Sparkles,
  Layers,
  Edit2,
  Send,
  CalendarX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { CalendarItemWithRelations, CalendarStatus } from "@/types/calendar";
import { updateScheduleAction } from "@/app/actions/calendar";

interface CalendarMonthViewProps {
  items: CalendarItemWithRelations[];
  onItemsChange?: () => void;
  selectedCategoryId?: string;
}

export function CalendarMonthView({
  items,
  onItemsChange,
  selectedCategoryId,
}: CalendarMonthViewProps) {
  const router = useRouter();

  // Mês e ano em visualização
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Item selecionado para modal de detalhes / reagendamento
  const [selectedItem, setSelectedItem] = useState<CalendarItemWithRelations | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);
  const [isPublishingNow, setIsPublishingNow] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navegação
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleGoToday = () => {
    setCurrentDate(new Date());
  };

  const monthName = useMemo(() => {
    const raw = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(currentDate);
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, [currentDate]);

  // Filtragem dos itens (opcional por categoria)
  const filteredItems = useMemo(() => {
    if (!selectedCategoryId || selectedCategoryId === "all") return items;
    return items.filter((it) => (it.category_id || it.category?.id) === selectedCategoryId);
  }, [items, selectedCategoryId]);

  // Agrupamento dos itens por chave de data (YYYY-MM-DD)
  const itemsByDate = useMemo(() => {
    const map = new Map<string, CalendarItemWithRelations[]>();

    for (const item of filteredItems) {
      if (!item.scheduled_at) continue;

      const dateObj = new Date(item.scheduled_at);
      if (isNaN(dateObj.getTime())) continue;

      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${d}`;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(item);
    }

    // Ordenar itens de cada dia por hora
    map.forEach((list) => {
      list.sort((a, b) => {
        const timeA = new Date(a.scheduled_at!).getTime();
        const timeB = new Date(b.scheduled_at!).getTime();
        return timeA - timeB;
      });
    });

    return map;
  }, [filteredItems]);

  // Construção dos dias da grade (incluindo dias padding do mês anterior e posterior)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 (Dom) a 6 (Sáb)
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days = [];

    // Dias do mês anterior
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      const y = prevDate.getFullYear();
      const m = String(prevDate.getMonth() + 1).padStart(2, "0");
      const dateKey = `${y}-${m}-${String(d).padStart(2, "0")}`;

      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: false,
        isToday: false,
        items: itemsByDate.get(dateKey) || [],
      });
    }

    // Dias do mês atual
    const today = new Date();
    const isCurrentYearMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDate = today.getDate();

    for (let d = 1; d <= totalDaysInMonth; d++) {
      const m = String(month + 1).padStart(2, "0");
      const dateKey = `${year}-${m}-${String(d).padStart(2, "0")}`;

      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: true,
        isToday: isCurrentYearMonth && todayDate === d,
        items: itemsByDate.get(dateKey) || [],
      });
    }

    // Dias do próximo mês para completar grade de 35 ou 42 células
    const remainingCells = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length;
    for (let d = 1; d <= remainingCells; d++) {
      const nextDate = new Date(year, month + 1, d);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, "0");
      const dateKey = `${y}-${m}-${String(d).padStart(2, "0")}`;

      days.push({
        dayNumber: d,
        dateKey,
        isCurrentMonth: false,
        isToday: false,
        items: itemsByDate.get(dateKey) || [],
      });
    }

    return days;
  }, [year, month, itemsByDate]);

  // Abertura do modal de edição rápida
  const handleOpenItem = (item: CalendarItemWithRelations) => {
    setSelectedItem(item);
    setModalFeedback(null);

    if (item.scheduled_at) {
      const dt = new Date(item.scheduled_at);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");

      setEditDate(`${y}-${m}-${d}`);
      setEditTime(`${hh}:${mm}`);
    } else {
      const now = new Date();
      setEditDate(now.toISOString().split("T")[0]);
      setEditTime("09:00");
    }
  };

  // Salvar reagendamento individual
  const handleSaveSchedule = async () => {
    if (!selectedItem || !editDate || !editTime) return;

    setIsUpdatingSchedule(true);
    setModalFeedback(null);

    try {
      const [h, min] = editTime.split(":");
      const [y, m, d] = editDate.split("-");
      const targetDate = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min), 0);

      await updateScheduleAction(selectedItem.id, targetDate.toISOString(), "SCHEDULED");

      setModalFeedback({
        type: "success",
        message: "Horário de publicação atualizado com sucesso!",
      });

      setTimeout(() => {
        setIsUpdatingSchedule(false);
        setSelectedItem(null);
        router.refresh();
        onItemsChange?.();
      }, 1000);
    } catch (err) {
      setModalFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao reagendar pauta.",
      });
      setIsUpdatingSchedule(false);
    }
  };

  // Revogar agendamento individual (remover data e voltar para PLANNED)
  const handleCancelSchedule = async () => {
    if (!selectedItem) return;

    setIsUpdatingSchedule(true);
    setModalFeedback(null);

    try {
      await updateScheduleAction(selectedItem.id, null, "PLANNED");

      setModalFeedback({
        type: "success",
        message: "Agendamento revogado com sucesso! A pauta retornou para status PLANNED.",
      });

      setTimeout(() => {
        setIsUpdatingSchedule(false);
        setSelectedItem(null);
        router.refresh();
        onItemsChange?.();
      }, 1000);
    } catch (err) {
      setModalFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao revogar agendamento da pauta.",
      });
      setIsUpdatingSchedule(false);
    }
  };

  // Publicar agora (forçar execução imediata)
  const handlePublishNow = async () => {
    if (!selectedItem) return;

    setIsPublishingNow(true);
    setModalFeedback(null);

    try {
      // 1. Atualiza pauta para READY se não estiver
      await updateScheduleAction(selectedItem.id, new Date().toISOString(), "READY");

      // 2. Aciona o endpoint de cron/publicação
      const res = await fetch("/api/cron/publish-content", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha na publicação no WordPress.");
      }

      setModalFeedback({
        type: "success",
        message: "Artigo publicado com sucesso no WordPress!",
      });

      setTimeout(() => {
        setIsPublishingNow(false);
        setSelectedItem(null);
        router.refresh();
        onItemsChange?.();
      }, 1200);
    } catch (err) {
      setModalFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao publicar no WordPress.",
      });
      setIsPublishingNow(false);
    }
  };

  // Cor do status
  const getStatusColor = (status: CalendarStatus) => {
    switch (status) {
      case "PUBLISHED":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "SCHEDULED":
        return "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30";
      case "READY":
        return "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30";
      case "IN_PROGRESS":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "FAILED":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30";
    }
  };

  // Cores de categorias (geradas deterministicamente pelo nome)
  const getCategoryBadgeClass = (categoryName?: string) => {
    if (!categoryName) return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    const colors = [
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
      "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
    ];
    let hash = 0;
    for (let i = 0; i < categoryName.length; i++) {
      hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const weekDayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Totalizadores do mês visível
  const monthStats = useMemo(() => {
    let totalScheduled = 0;
    let totalPublished = 0;

    for (const day of calendarDays) {
      if (day.isCurrentMonth) {
        for (const it of day.items) {
          if (it.status === "SCHEDULED") totalScheduled++;
          if (it.status === "PUBLISHED") totalPublished++;
        }
      }
    }

    return { totalScheduled, totalPublished };
  }, [calendarDays]);

  return (
    <div className="space-y-4">
      {/* Barra Superior do Calendário */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-border rounded-lg overflow-hidden bg-background">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleGoToday}
              className="px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors border-x border-border"
            >
              Hoje
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            {monthName} de {year}
          </h3>
        </div>

        {/* Estatísticas Rápidas do Mês */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 font-medium border border-sky-200/50">
            <Clock className="h-3 w-3" />
            {monthStats.totalScheduled} Agendados
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium border border-emerald-200/50">
            <CheckCircle2 className="h-3 w-3" />
            {monthStats.totalPublished} Publicados
          </span>
        </div>
      </div>

      {/* Grade Mensal */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {/* Cabeçalho dos Dias da Semana */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-center text-xs font-semibold text-muted-foreground py-2.5">
          {weekDayNames.map((d, i) => (
            <div key={d} className={i === 0 || i === 6 ? "text-muted-foreground/70" : ""}>
              {d}
            </div>
          ))}
        </div>

        {/* Células dos Dias */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-border/60">
          {calendarDays.map((cell) => {
            return (
              <div
                key={cell.dateKey}
                className={`min-h-[125px] p-1.5 sm:p-2 transition-colors flex flex-col justify-between ${
                  cell.isCurrentMonth ? "bg-card" : "bg-muted/15 opacity-50"
                } ${cell.isToday ? "ring-2 ring-primary/40 ring-inset bg-primary/[0.02]" : ""}`}
              >
                {/* Cabeçalho do Dia */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold rounded-full h-6 w-6 ${
                      cell.isToday
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : cell.isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {cell.dayNumber}
                  </span>

                  {cell.items.length > 0 && (
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {cell.items.length} {cell.items.length === 1 ? "artigo" : "artigos"}
                    </span>
                  )}
                </div>

                {/* Lista de Artigos do Dia */}
                <div className="space-y-1.5 overflow-y-auto max-h-[140px] pr-0.5 flex-1">
                  {cell.items.map((item) => {
                    const timeStr = item.scheduled_at
                      ? new Date(item.scheduled_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "--:--";

                    const imageUrl = item.content_item?.featured_image?.public_url;
                    const catName = item.category?.name || "Geral";

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleOpenItem(item)}
                        className="w-full text-left p-1.5 rounded-lg border border-border/80 bg-background hover:bg-muted/50 hover:border-primary/40 transition-all text-[11px] shadow-2xs group flex items-start gap-1.5"
                      >
                        {/* Miniatura WebP se existir */}
                        {imageUrl ? (
                          <div className="h-7 w-7 rounded shrink-0 overflow-hidden bg-muted border border-border/60">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrl}
                              alt={item.proposed_title}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded shrink-0 bg-primary/10 flex items-center justify-center text-primary">
                            <Clock className="h-3 w-3" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 leading-none mb-1">
                            <span className="font-mono text-[10px] font-semibold text-foreground">
                              {timeStr}
                            </span>
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded border font-medium ${getStatusColor(
                                item.status
                              )}`}
                            >
                              {item.status.slice(0, 4)}
                            </span>
                          </div>

                          <div className="truncate font-medium text-foreground text-[11px] leading-tight">
                            {item.proposed_title || item.topic}
                          </div>

                          <span
                            className={`inline-block mt-0.5 text-[9px] px-1 py-0.2 rounded border truncate max-w-full ${getCategoryBadgeClass(
                              catName
                            )}`}
                          >
                            {catName}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Detalhes / Reagendamento Rápido */}
      {selectedItem && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedItem(null)}
          title="Detalhes da Publicação Agendada"
          description="Consulte a pauta, altere data/horário ou publique diretamente no WordPress."
          className="max-w-xl"
        >
          <div className="space-y-4 text-xs">
            {/* Header com Miniatura e Título */}
            <div className="flex items-start gap-3.5 p-3 rounded-lg border border-border bg-muted/20">
              {selectedItem.content_item?.featured_image?.public_url ? (
                <div className="h-16 w-20 rounded-md overflow-hidden bg-muted border border-border shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selectedItem.content_item.featured_image.public_url}
                    alt={selectedItem.proposed_title}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-16 w-20 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <CalendarIcon className="h-6 w-6" />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getStatusColor(selectedItem.status)}>
                    {selectedItem.status}
                  </Badge>
                  <Badge variant="outline" className={getCategoryBadgeClass(selectedItem.category?.name)}>
                    {selectedItem.category?.name || "Geral"}
                  </Badge>
                  {selectedItem.blog?.name && (
                    <span className="text-muted-foreground text-[10px]">
                      {selectedItem.blog.name}
                    </span>
                  )}
                </div>
                <h4 className="font-semibold text-foreground text-sm leading-tight">
                  {selectedItem.proposed_title || selectedItem.topic}
                </h4>
                <p className="text-muted-foreground text-[11px] line-clamp-1">
                  Tema: {selectedItem.topic}
                </p>
              </div>
            </div>

            {/* Configuração de Data e Hora */}
            <div className="p-3 rounded-lg border border-border/80 bg-card space-y-3">
              <h5 className="font-medium text-foreground text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-primary" />
                Data e Horário de Publicação
              </h5>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                    Data Programada
                  </label>
                  <Input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                    Horário (HH:MM)
                  </label>
                  <Input
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSchedule}
                  disabled={isUpdatingSchedule || isPublishingNow || !selectedItem.scheduled_at}
                  className="h-8 text-xs gap-1.5 text-destructive hover:bg-destructive/10 border-destructive/30"
                  title="Remove a data agendada desta pauta e cancela a publicação automática"
                >
                  <CalendarX className="h-3.5 w-3.5" />
                  Revogar Agendamento
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSchedule}
                  disabled={isUpdatingSchedule || isPublishingNow}
                  className="h-8 text-xs gap-1.5"
                >
                  {isUpdatingSchedule ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Edit2 className="h-3.5 w-3.5" />
                      Salvar Novo Horário
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Feedback Message */}
            {modalFeedback && (
              <div
                className={`flex items-center gap-2 p-3 rounded-lg border text-xs ${
                  modalFeedback.type === "success"
                    ? "border-success/30 bg-[hsl(var(--success-bg))] text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {modalFeedback.type === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{modalFeedback.message}</span>
              </div>
            )}

            {/* Ações Inferiores */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                {selectedItem.content_item?.id && (
                  <Link href={`/content/${selectedItem.content_item.id}`}>
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1">
                      <ExternalLink className="h-3 w-3" />
                      Ver Artigo Completo
                    </Button>
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedItem(null)}
                  disabled={isUpdatingSchedule || isPublishingNow}
                  className="h-8 text-xs"
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePublishNow}
                  disabled={isUpdatingSchedule || isPublishingNow}
                  className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPublishingNow ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Publicando no WP...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Publicar Agora no WP
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

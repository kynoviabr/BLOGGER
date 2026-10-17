"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import {
  CalendarDays,
  Clock,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarItemWithRelations } from "@/types/calendar";
import { CadenceService, CadenceSlotConfig, PlannedScheduleItem } from "@/services/cadence.service";
import { bulkScheduleAction } from "@/app/actions/calendar";

interface CadenceSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CalendarItemWithRelations[];
  onScheduledSuccess?: () => void;
}

export function CadenceSchedulerModal({
  isOpen,
  onClose,
  items,
  onScheduledSuccess,
}: CadenceSchedulerModalProps) {
  // Pautas candidatas a agendamento (todas exceto já publicadas)
  const candidateItems = useMemo(() => {
    return items.filter((it) => it.status !== "PUBLISHED");
  }, [items]);

  // Data inicial padrão: amanhã
  const defaultStartDate = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [daysMode, setDaysMode] = useState<"all" | "workdays">("workdays");
  const [distributionMode, setDistributionMode] = useState<"balanced" | "sequential">("balanced");
  const [slots, setSlots] = useState<CadenceSlotConfig[]>([
    { time: "09:00" },
    { time: "15:00" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Manipulação de slots
  const handleAddSlot = () => {
    if (slots.length >= 6) return;
    setSlots((prev) => [...prev, { time: "18:00" }]);
  };

  const handleRemoveSlot = (index: number) => {
    if (slots.length <= 1) return;
    setSlots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSlotTimeChange = (index: number, newTime: string) => {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, time: newTime } : slot))
    );
  };

  // Cálculo em tempo real da simulação do calendário
  const plannedSchedule: PlannedScheduleItem[] = useMemo(() => {
    if (candidateItems.length === 0 || slots.length === 0 || !startDate) return [];

    return CadenceService.calculateSchedule(candidateItems, {
      startDate,
      slots,
      daysMode,
      distributionMode,
    });
  }, [candidateItems, slots, startDate, daysMode, distributionMode]);

  // Contagem de categorias presentes
  const categoriesPresent = useMemo(() => {
    const set = new Set<string>();
    candidateItems.forEach((i) => {
      const name = i.category?.name || "Geral";
      set.add(name);
    });
    return Array.from(set);
  }, [candidateItems]);

  const handleConfirmSchedule = async () => {
    if (plannedSchedule.length === 0) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = plannedSchedule.map((p) => ({
        id: p.calendarId,
        scheduledAt: p.scheduledAt,
        status: "SCHEDULED" as const,
      }));

      const res = await bulkScheduleAction(payload);
      if (res.success) {
        setSaveSuccess(res.count);
        setTimeout(() => {
          setIsSaving(false);
          setSaveSuccess(null);
          onScheduledSuccess?.();
          onClose();
        }, 1200);
      } else {
        throw new Error("Não foi possível salvar o agendamento em lote.");
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro ao gravar agendamento no Supabase.");
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Planejar Calendário de Publicação"
      description="Configure a cadência de publicação diária e distribua artigos automaticamente entre horários e categorias."
      className="max-w-3xl"
    >
      <div className="space-y-6 text-sm">
        {/* Resumo de pautas elegíveis */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-primary shrink-0" />
            <div>
              <span className="font-semibold text-foreground">
                {candidateItems.length} pauta(s) prontas para agendamento
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Distribuição entre {categoriesPresent.length} categoria(s):{" "}
                <span className="font-medium text-foreground">{categoriesPresent.join(", ")}</span>
              </p>
            </div>
          </div>
          <Badge variant="info">
            {plannedSchedule.length} slots gerados
          </Badge>
        </div>

        {/* Configurações de Cadência */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Data de Início e Dias */}
          <div className="space-y-3.5 p-4 rounded-lg border border-border/80 bg-card/60">
            <h4 className="font-medium text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              1. Início e Dias de Publicação
            </h4>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Data Inicial do Agendamento
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Dias da Semana Permitidos
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={daysMode === "workdays" ? "primary" : "outline"}
                  onClick={() => setDaysMode("workdays")}
                  className="text-xs justify-center"
                >
                  Segunda a Sexta
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={daysMode === "all" ? "primary" : "outline"}
                  onClick={() => setDaysMode("all")}
                  className="text-xs justify-center"
                >
                  Todos os Dias
                </Button>
              </div>
            </div>
          </div>

          {/* Horários / Janelas diárias */}
          <div className="space-y-3.5 p-4 rounded-lg border border-border/80 bg-card/60">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-foreground flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5 text-primary" />
                2. Horários por Dia ({slots.length} por dia)
              </h4>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSlot}
                disabled={slots.length >= 6}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                Slot
              </Button>
            </div>

            <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
              {slots.map((slot, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-12 shrink-0">
                    Slot {index + 1}:
                  </span>
                  <Input
                    type="time"
                    value={slot.time}
                    onChange={(e) => handleSlotTimeChange(index, e.target.value)}
                    className="text-xs h-8"
                  />
                  {slots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSlot(index)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover slot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Modo de Distribuição
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={distributionMode === "balanced" ? "primary" : "outline"}
                  onClick={() => setDistributionMode("balanced")}
                  className="text-xs justify-center gap-1"
                  title="Alterna categorias entre horários para manter variedade"
                >
                  <Layers className="h-3 w-3" />
                  Multi-Categoria
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={distributionMode === "sequential" ? "primary" : "outline"}
                  onClick={() => setDistributionMode("sequential")}
                  className="text-xs justify-center"
                >
                  Sequencial
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Pré-visualização da Simulação */}
        <div>
          <div className="flex items-center justify-between pb-2">
            <h4 className="font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
              Pré-Visualização do Agendamento ({plannedSchedule.length} artigos)
            </h4>
            <span className="text-xs text-muted-foreground">
              Será gravado no Supabase com status <Badge variant="info" className="text-[10px] py-0 px-1.5">SCHEDULED</Badge>
            </span>
          </div>

          <div className="rounded-lg border border-border overflow-hidden max-h-[220px] overflow-y-auto bg-card">
            {plannedSchedule.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhuma pauta disponível para simulação com os filtros atuais.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {plannedSchedule.map((p, idx) => (
                  <div
                    key={p.calendarId}
                    className="flex items-center justify-between p-2.5 text-xs hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-muted-foreground font-mono w-5 shrink-0 text-right">
                        {idx + 1}.
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline" className="font-mono text-[11px] bg-background">
                          {p.displayDate} ({p.dayOfWeekName.slice(0, 3)})
                        </Badge>
                        <Badge variant="info" className="font-mono text-[11px]">
                          {p.displayTime}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0 border-primary/30 text-primary">
                        {p.categoryName}
                      </Badge>
                      <span className="truncate font-medium text-foreground">
                        {p.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {saveSuccess !== null && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-success/30 bg-[hsl(var(--success-bg))] text-xs text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{saveSuccess} pautas gravadas e agendadas com sucesso no Supabase!</span>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmSchedule}
            disabled={isSaving || plannedSchedule.length === 0 || saveSuccess !== null}
            className="gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gravando no Supabase...
              </>
            ) : saveSuccess !== null ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Agendado!
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Salvar e Agendar no Supabase ({plannedSchedule.length})
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

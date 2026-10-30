"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Table as TableIcon,
  Sparkles,
  Zap,
  Plus,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CalendarItemWithRelations, CalendarStatus } from "@/types/calendar";
import { Category } from "@/types/blog";
import { CalendarMonthView } from "./calendar-month-view";
import { CalendarTableView } from "./calendar-table-view";
import { CadenceSchedulerModal } from "./cadence-scheduler-modal";

interface CalendarViewContainerProps {
  initialItems: CalendarItemWithRelations[];
  categories: Category[];
  blogId?: string;
  initialStatus?: CalendarStatus;
  initialView?: "month" | "table";
}

export function CalendarViewContainer({
  initialItems,
  categories,
  blogId,
  initialStatus,
  initialView = "month",
}: CalendarViewContainerProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"month" | "table">(initialView);
  const [statusFilter, setStatusFilter] = useState<CalendarStatus | "all">(initialStatus || "all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);

  // Filtragem local combinada (Status e Categoria)
  const filteredItems = React.useMemo(() => {
    return initialItems.filter((item) => {
      const matchStatus = statusFilter === "all" || item.status === statusFilter;
      const matchCategory =
        selectedCategoryId === "all" ||
        item.category_id === selectedCategoryId ||
        item.category?.id === selectedCategoryId;

      return matchStatus && matchCategory;
    });
  }, [initialItems, statusFilter, selectedCategoryId]);

  const statuses: CalendarStatus[] = [
    "SCHEDULED",
    "READY",
    "PUBLISHED",
    "PLANNED",
    "IN_PROGRESS",
    "FAILED",
  ];

  return (
    <div className="space-y-5">
      {/* Barra de Ações Principais do Calendário */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-border/60">
        {/* Alternador de Modo (Grade Mensal vs Tabela) */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border border-border bg-muted/40">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "month" ? "primary" : "ghost"}
            onClick={() => setViewMode("month")}
            className="h-8 text-xs gap-1.5"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Grade Mensal
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "table" ? "primary" : "ghost"}
            onClick={() => setViewMode("table")}
            className="h-8 text-xs gap-1.5"
          >
            <TableIcon className="h-3.5 w-3.5" />
            Tabela Detalhada
          </Button>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Planejar Calendário */}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsSchedulerOpen(true)}
            className="gap-1.5 bg-gradient-to-r from-primary to-indigo-600 text-white shadow-xs hover:opacity-95"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Planejar Calendário
          </Button>

          {/* Links para Ideias e Nova Pauta */}
          <Link href={`/ideas${blogId ? `?blogId=${blogId}` : ""}`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Ideias com IA
            </Button>
          </Link>

          <Link href={`/calendar/new${blogId ? `?blogId=${blogId}` : ""}`}>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Nova Pauta
            </Button>
          </Link>
        </div>
      </div>

      {/* Barra de Filtros: Categorias e Status */}
      <div className="space-y-2 p-3.5 rounded-xl border border-border bg-card/50">
        {/* Filtro por Categorias */}
        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-border/40">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-2">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Categorias:</span>
            </div>

            <Badge
              variant={selectedCategoryId === "all" ? "info" : "outline"}
              onClick={() => setSelectedCategoryId("all")}
              className="cursor-pointer text-xs"
            >
              Todas ({initialItems.length})
            </Badge>

            {categories.map((cat) => {
              const count = initialItems.filter(
                (i) => i.category_id === cat.id || i.category?.id === cat.id
              ).length;
              return (
                <Badge
                  key={cat.id}
                  variant={selectedCategoryId === cat.id ? "info" : "outline"}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="cursor-pointer text-xs"
                >
                  {cat.name} {count > 0 ? `(${count})` : ""}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Filtro por Status */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mr-2">
            <Filter className="h-3.5 w-3.5" />
            <span>Status:</span>
          </div>

          <Badge
            variant={statusFilter === "all" ? "info" : "outline"}
            onClick={() => setStatusFilter("all")}
            className="cursor-pointer text-xs"
          >
            Todos
          </Badge>

          {statuses.map((st) => {
            const count = initialItems.filter((i) => i.status === st).length;
            if (count === 0 && statusFilter !== st) return null;

            return (
              <Badge
                key={st}
                variant={statusFilter === st ? "info" : st === "FAILED" ? "error" : "outline"}
                onClick={() => setStatusFilter(st)}
                className="cursor-pointer text-xs"
              >
                {st} {count > 0 ? `(${count})` : ""}
              </Badge>
            );
          })}
        </div>
      </div>

      {/* Exibição Principal: Grade Mensal vs Tabela */}
      {viewMode === "month" ? (
        <CalendarMonthView
          items={filteredItems}
          selectedCategoryId={selectedCategoryId}
          onItemsChange={() => router.refresh()}
        />
      ) : (
        <Card className="overflow-hidden">
          <CalendarTableView initialItems={filteredItems} />
        </Card>
      )}

      {/* Modal de Agendamento Inteligente */}
      <CadenceSchedulerModal
        isOpen={isSchedulerOpen}
        onClose={() => setIsSchedulerOpen(false)}
        blogId={blogId}
      />
    </div>
  );
}

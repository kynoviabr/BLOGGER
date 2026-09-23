import Link from "next/link";
import { Plus, Filter, AlertCircle, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarService } from "@/services/calendar.service";
import { CalendarStatus, CalendarItemWithRelations } from "@/types/calendar";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarTableView } from "@/components/calendar/calendar-table-view";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string; status?: CalendarStatus }>;
}) {
  const { blogId, status } = await searchParams;
  let items: CalendarItemWithRelations[] = [];
  let loadError: string | null = null;

  try {
    items = await CalendarService.listCalendarItems({ blogId, status });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar o calendário.";
  }

  const statuses: CalendarStatus[] = [
    "IDEA",
    "PLANNED",
    "IN_PROGRESS",
    "READY",
    "SCHEDULED",
    "PUBLISHED",
    "FAILED",
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário Editorial"
        description="Planeje pautas, defina datas de publicação e acompanhe ou execute o ciclo completo de produção de cada artigo."
        actions={
          <div className="flex items-center gap-2.5">
            <Link href="/ideas">
              <Button size="sm" variant="outline" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
                <Sparkles className="h-4 w-4 text-blue-500" />
                Gerar Ideias com IA
              </Button>
            </Link>
            <Link href="/calendar/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nova Pauta
              </Button>
            </Link>
          </div>
        }
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar pautas no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mr-2">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtrar por Status:</span>
        </div>
        <Link href="/calendar">
          <Badge variant={!status ? "info" : "outline"} className="cursor-pointer">
            Todos
          </Badge>
        </Link>
        {statuses.map((st) => {
          const count = items.filter((i) => i.status === st).length;
          return (
            <Link key={st} href={`/calendar?status=${st}${blogId ? `&blogId=${blogId}` : ""}`}>
              <Badge
                variant={status === st ? "info" : st === "FAILED" && count > 0 ? "error" : "outline"}
                className="cursor-pointer"
              >
                {st} {count > 0 ? `(${count})` : ""}
              </Badge>
            </Link>
          );
        })}
      </div>

      {items.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhuma pauta encontrada"
          description="Cadastre um tema e uma data/hora programada para iniciar a produção automatizada."
          actionLabel="Cadastrar Pauta"
        />
      ) : (
        <Card className="overflow-hidden">
          <CalendarTableView initialItems={items} />
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { Plus, Calendar as CalendarIcon, Filter, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { CalendarService } from "@/services/calendar.service";
import { formatDate } from "@/lib/utils";
import { CalendarStatus, CalendarItemWithRelations } from "@/types/calendar";
import { EmptyState } from "@/components/shared/empty-state";

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
        description="Planeje pautas, defina datas e horários de publicação e acompanhe o ciclo de produção de cada artigo."
        actions={
          <Link href="/calendar/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nova Pauta
            </Button>
          </Link>
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
        {statuses.map((st) => (
          <Link key={st} href={`/calendar?status=${st}${blogId ? `&blogId=${blogId}` : ""}`}>
            <Badge variant={status === st ? "info" : "outline"} className="cursor-pointer">
              {st}
            </Badge>
          </Link>
        ))}
      </div>

      {items.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhuma pauta encontrada"
          description="Cadastre um tema e uma data/hora programada para iniciar a produção automatizada."
          actionLabel="Cadastrar Pauta"
        />
      ) : (
        <Card>
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
              {items.map((item) => (
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
                    <Link href={`/calendar/${item.id}`}>
                      <Button variant="ghost" size="sm" className="text-xs">
                        Editar
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

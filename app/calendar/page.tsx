import Link from "next/link";
import { cookies } from "next/headers";
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
  const { blogId: queryBlogId, status } = await searchParams;
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

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
            <Link href={`/ideas${blogId ? `?blogId=${blogId}` : ""}`}>
              <Button size="sm" variant="outline" className="gap-1.5 border-primary/30 text-primary hover:bg-[hsl(var(--primary-light))]">
                <Sparkles className="h-4 w-4 text-primary" />
                Gerar Ideias com IA
              </Button>
            </Link>
            <Link href={`/calendar/new${blogId ? `?blogId=${blogId}` : ""}`}>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nova Pauta
              </Button>
            </Link>
          </div>
        }
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/25 bg-[hsl(var(--danger-bg))] p-4 text-xs text-destructive ">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar pautas no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtrar por Status:</span>
        </div>
        <Link href={`/calendar${blogId ? `?blogId=${blogId}` : ""}`}>
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
          description={
            blogId
              ? "Nenhuma pauta cadastrada para este blog com o status selecionado."
              : "Cadastre um tema e uma data/hora programada para iniciar a produção automatizada."
          }
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

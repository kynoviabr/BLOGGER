import Link from "next/link";
import { cookies } from "next/headers";
import { FileText, CheckCircle, Clock, AlertCircle, AlertTriangle, CalendarClock, Filter, X } from "lucide-react";
import { EditorialFlow, flowStepForContentStatus } from "@/components/shared/editorial-flow";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ContentService } from "@/services/content.service";
import { BlogService } from "@/services/blog.service";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ArchiveDraftsButton } from "@/components/content/archive-drafts-button";
import { ApproveReviewedButton } from "@/components/content/approve-reviewed-button";
import { AutoRefresh } from "@/components/content/auto-refresh";
import { ContentItemWithRelations, ContentStatus } from "@/types/content";

export const dynamic = "force-dynamic";

export default async function ContentListPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string; status?: ContentStatus }>;
}) {
  const { blogId: queryBlogId, status } = await searchParams;
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

  let contentItems: ContentItemWithRelations[] = [];
  let reviewingItems: ContentItemWithRelations[] = [];
  let loadError: string | null = null;
  let activeBlogName = "";

  try {
    const [items, blogs, reviewing] = await Promise.all([
      ContentService.listContent({ blogId, status }),
      BlogService.listBlogs(),
      status === "reviewing" ? Promise.resolve(null) : ContentService.listContent({ blogId, status: "reviewing" }),
    ]);
    contentItems = items;
    reviewingItems = reviewing ?? items;
    if (blogId) {
      activeBlogName = blogs.find((b) => b.id === blogId)?.name || "";
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os artigos.";
  }

  const statuses: { label: string; value?: ContentStatus }[] = [
    { label: "Todos" },
    { label: "Rascunho", value: "draft" },
    { label: "Em produção", value: "researching" },
    { label: "Em Revisão", value: "reviewing" },
    { label: "Prontos", value: "ready" },
    { label: "Aprovados e agendados", value: "scheduled" },
    { label: "Falha de publicação", value: "publish_failed" },
    { label: "Publicados", value: "published" },
    { label: "Arquivados", value: "archived" },
  ];

  // Artigos em revisão com data no calendário: sem aprovação eles não são publicados.
  const now = Date.now();
  const pendingWithDate = reviewingItems.filter((item) => item.editorial_calendar?.scheduled_at);
  const overdueCount = pendingWithDate.filter(
    (item) => new Date(item.editorial_calendar!.scheduled_at!).getTime() <= now
  ).length;
  const approvableIds = pendingWithDate
    .filter((item) => new Date(item.editorial_calendar!.scheduled_at!).getTime() > now && item.body?.trim())
    .map((item) => item.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artigos: Revisão e Aprovação"
        description="Os artigos chegam aqui prontos, com texto, SEO e imagem. Revise e aprove: só artigos aprovados são publicados."
      />

      <EditorialFlow current={flowStepForContentStatus(status)} />

      <AutoRefresh active={contentItems.some((item) => item.status === "researching")} />

      {pendingWithDate.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>{pendingWithDate.length} artigo(s) com data marcada ainda não foram aprovados.</strong> Sem aprovação,
              eles não são publicados.
              {overdueCount > 0 && ` ${overdueCount} já passaram da data.`}
            </span>
          </div>
          {status !== "reviewing" && (
            <Link href={`/content?status=reviewing${blogId ? `&blogId=${blogId}` : ""}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs">Ver os que faltam aprovar</Button>
            </Link>
          )}
        </div>
      )}

      {/* Barra de Filtros de Status e Blog Ativo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {statuses.map((s) => {
            const isActive = (!status && !s.value) || status === s.value;
            const queryParams = new URLSearchParams();
            if (blogId) queryParams.set("blogId", blogId);
            if (s.value) queryParams.set("status", s.value);
            const href = `/content${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

            return (
              <Link key={s.label} href={href}>
                <Button
                  size="sm"
                  variant={isActive ? "primary" : "outline"}
                  className="h-7 text-xs px-2.5 font-medium"
                >
                  {s.label}
                </Button>
              </Link>
            );
          })}
        </div>

        {status === "reviewing" && approvableIds.length > 0 && <ApproveReviewedButton ids={approvableIds} />}

        {status === "draft" && contentItems.length > 0 && (
          <ArchiveDraftsButton ids={contentItems.map((item) => item.id)} />
        )}

        {activeBlogName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-md border border-border">
            <Filter className="h-3.5 w-3.5 text-primary" />
            <span>
              Filtrado por: <strong className="text-foreground">{activeBlogName}</strong>
            </span>
            <Link
              href="/content?blogId=all"
              className="ml-1 text-muted-foreground hover:text-foreground"
              title="Limpar filtro de blog"
            >
              <X className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </div>

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao consultar artigos no Supabase:</span>
            {loadError}
          </div>
        </div>
      )}

      {contentItems.length === 0 && !loadError ? (
        <EmptyState
          title={blogId ? "Nenhum artigo encontrado para este blog" : "Nenhum artigo produzido"}
          description={
            blogId
              ? "Não há artigos com os filtros selecionados para este blog. Selecione 'Todos os Blogs' no topo para ver os demais."
              : "Assim que uma pauta do calendário for processada pela pipeline de IA, os artigos aparecerão aqui para revisão."
          }
          icon={<FileText className="h-6 w-6" />}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título do Artigo</TableHead>
                <TableHead>Blog</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Publicação</TableHead>
                <TableHead>Última Edição</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contentItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium max-w-md">
                    <Link
                      href={`/content/${item.id}`}
                      className="text-foreground hover:text-primary dark:hover:text-blue-400 block truncate"
                    >
                      {item.title}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[180px]">
                        /{item.slug}
                      </span>
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
                  <TableCell className="text-xs text-foreground">
                    {item.blog?.name || "Blog"}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {item.language}
                  </TableCell>
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
                        <div
                          className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"
                          title="Sem aprovação, o artigo não é publicado nesta data."
                        >
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
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(item.updated_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/content/${item.id}`}>
                      <Button variant="outline" size="sm" className="text-xs">
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

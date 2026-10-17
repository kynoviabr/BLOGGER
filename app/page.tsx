import { cookies } from "next/headers";
import Link from "next/link";
import {
  Globe,
  Calendar,
  Image as ImageIcon,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  Filter,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { BlogService } from "@/services/blog.service";
import { CalendarService } from "@/services/calendar.service";
import { ContentService } from "@/services/content.service";
import { MediaService } from "@/services/media.service";
import { LogService } from "@/services/log.service";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string }>;
}) {
  const { blogId: queryBlogId } = await searchParams;
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

  const [blogs, calendarItems, contentItems, mediaAssets, logs] = await Promise.all([
    BlogService.listBlogs().catch(() => []),
    CalendarService.listCalendarItems({ blogId }).catch(() => []),
    ContentService.listContent({ blogId }).catch(() => []),
    MediaService.listMedia(blogId).catch(() => []),
    LogService.listLogs().catch(() => []),
  ]);

  const activeBlog = blogId ? blogs.find((b) => b.id === blogId) : null;
  const activeBlogs = blogs.filter((b) => b.status === "active").length;
  const plannedTopics = calendarItems.filter((c) => c.status === "PLANNED" || c.status === "IDEA").length;
  const inProgressTopics = calendarItems.filter((c) => c.status === "IN_PROGRESS").length;
  const scheduledTopics = calendarItems.filter((c) => c.status === "SCHEDULED").length;
  const publishedCount = contentItems.filter((c) => c.status === "published").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard Editorial"
        description="Visão geral dos blogs gerenciados, pautas em pipeline e publicações agendadas."
        actions={
          <div className="flex gap-2">
            <Link href={blogId ? `/calendar/new?blogId=${blogId}` : "/calendar/new"}>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Nova Pauta
              </Button>
            </Link>
            <Link href="/blogs/new">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Globe className="h-4 w-4" />
                Novo Blog
              </Button>
            </Link>
          </div>
        }
      />

      {/* Indicador de Filtro Ativo por Blog */}
      {activeBlog && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/25 bg-[hsl(var(--info-bg))] px-4 py-2.5 text-xs text-foreground">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary shrink-0" />
            <span>
              Filtrando métricas e dados pelo blog: <strong>{activeBlog.name}</strong> ({activeBlog.default_language})
            </span>
          </div>
          <Link
            href="/?blogId=all"
            className="inline-flex items-center gap-1 rounded bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border transition-colors"
          >
            <X className="h-3 w-3" />
            Ver todos os blogs
          </Link>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {activeBlog ? "Blog Selecionado" : "Blogs Ativos"}
            </CardTitle>
            <Globe className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground truncate" title={activeBlog ? activeBlog.name : undefined}>
              {activeBlog ? activeBlog.name : activeBlogs} {!activeBlog && <span className="text-xs font-normal text-slate-500">/ {blogs.length} total</span>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
              <span className="text-muted-foreground font-medium">
                {activeBlog ? `Nicho: ${activeBlog.niche || "Geral"}` : "Blogs ativos cadastrados"}
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pautas no Calendário
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {calendarItems.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {plannedTopics} planejadas • {inProgressTopics} em produção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Artigos Publicados
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {publishedCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {scheduledTopics} programados para publicação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Assets de Mídia
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {mediaAssets.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Imagens geradas e otimizadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Seções principais em sequência vertical */}
      <div className="space-y-8">
        {/* Próximas Pautas */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Próximas Pautas no Calendário
            </h2>
            <Link
              href={blogId ? `/calendar?blogId=${blogId}` : "/calendar"}
              className="text-xs font-medium text-primary hover:text-primary flex items-center gap-1"
            >
              Ver todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pauta / Título</TableHead>
                  <TableHead>Blog</TableHead>
                  <TableHead>Data Agendada</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendarItems.slice(0, 5).map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium max-w-xs truncate">
                      <Link
                        href={`/calendar/${item.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {item.proposed_title || item.topic}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {item.category?.name || "Sem categoria"} • {item.language}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.blog?.name || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(item.scheduled_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* Atividade do Sistema */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Atividade do Sistema
            </h2>
            <Link
              href="/logs"
              className="text-xs font-medium text-primary hover:text-primary flex items-center gap-1"
            >
              Ver logs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Card className="divide-y divide-border">
            {logs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    {log.service}
                  </span>
                  <span className="text-muted-foreground">{formatDate(log.created_at)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{log.message}</p>
              </div>
            ))}
          </Card>

          {/* Banner de Status da Arquitetura */}
          <div className="rounded-lg border border-border bg-accent p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-primary dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground block mb-0.5">
                  Content Factory Foundation
                </span>
                Esta fase implementa a base segura com Supabase Auth, RLS estrito e validação com Zod.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

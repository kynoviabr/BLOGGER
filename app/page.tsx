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

export default async function DashboardPage() {
  const [blogs, calendarItems, contentItems, mediaAssets, logs] = await Promise.all([
    BlogService.listBlogs().catch(() => []),
    CalendarService.listCalendarItems().catch(() => []),
    ContentService.listContent().catch(() => []),
    MediaService.listMedia().catch(() => []),
    LogService.listLogs().catch(() => []),
  ]);

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
            <Link href="/calendar/new">
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

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Blogs Ativos
            </CardTitle>
            <Globe className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {activeBlogs} <span className="text-xs font-normal text-slate-500">/ {blogs.length} total</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Blogs ativos cadastrados</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Pautas no Calendário
            </CardTitle>
            <Calendar className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {calendarItems.length}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {plannedTopics} planejadas • {inProgressTopics} em produção
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Artigos Publicados
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {publishedCount}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {scheduledTopics} programados para publicação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Assets de Mídia
            </CardTitle>
            <ImageIcon className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">
              {mediaAssets.length}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Imagens geradas e otimizadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Calendário Recente e Logs */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Pautas Recentes (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              Próximas Pautas no Calendário
            </h2>
            <Link
              href="/calendar"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
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
                        className="hover:text-blue-600 hover:underline"
                      >
                        {item.proposed_title || item.topic}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {item.category?.name || "Sem categoria"} • {item.language}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 dark:text-slate-300">
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
        </div>

        {/* System Logs & Arquitetura (1 col) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              Atividade do Sistema
            </h2>
            <Link
              href="/logs"
              className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Ver logs <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.slice(0, 4).map((log) => (
              <div key={log.id} className="p-4 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {log.service}
                  </span>
                  <span className="text-slate-400">{formatDate(log.created_at)}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{log.message}</p>
              </div>
            ))}
          </Card>

          {/* Banner de Status da Arquitetura */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-white block mb-0.5">
                  Content Factory Foundation
                </span>
                Esta fase implementa a base segura com Supabase Auth, RLS estrito e validação com Zod.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

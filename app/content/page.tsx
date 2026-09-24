import Link from "next/link";
import { FileText, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ContentService } from "@/services/content.service";
import { formatDate } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentItemWithRelations } from "@/types/content";

export default async function ContentListPage() {
  let contentItems: ContentItemWithRelations[] = [];
  let loadError: string | null = null;

  try {
    contentItems = await ContentService.listContent();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os artigos.";
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Artigos & Conteúdo"
        description="Visualize todos os artigos criados pela pipeline de IA, revise textos, ajuste SEO e acompanhe publicações."
      />

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
          title="Nenhum artigo produzido"
          description="Assim que uma pauta do calendário for processada pela pipeline de IA, os artigos aparecerão aqui para revisão."
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
                <TableHead>Data de Publicação</TableHead>
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
                    <span className="text-xs text-muted-foreground font-mono block truncate mt-0.5">
                      /{item.slug}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {item.blog?.name || "Blog"}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {item.language}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {item.published_at ? (
                      <div className="flex items-center gap-1.5 text-success">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {formatDate(item.published_at)}
                      </div>
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

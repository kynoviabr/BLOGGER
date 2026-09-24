import Link from "next/link";
import { Plus, Globe, FolderTree, Languages, ExternalLink, Power, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { BlogService } from "@/services/blog.service";
import { toggleBlogStatusAction } from "@/app/actions/blog";
import { EmptyState } from "@/components/shared/empty-state";
import { BlogWithRelations } from "@/types/blog";

export const dynamic = "force-dynamic";

export default async function BlogsPage() {
  let blogs: BlogWithRelations[] = [];
  let loadError: string | null = null;

  try {
    blogs = await BlogService.listBlogs();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Não foi possível carregar os blogs. Verifique a conexão com o banco.";
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gerenciamento de Blogs"
        description="Configure os blogs que serão alimentados pela Content Factory. Cada blog possui seu próprio nicho, audiência, categorias e idiomas."
        actions={
          <Link href="/blogs/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Novo Blog
            </Button>
          </Link>
        }
      />

      {loadError && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block">Erro ao conectar com a base de dados:</span>
            {loadError}
          </div>
        </div>
      )}

      {blogs.length === 0 && !loadError ? (
        <EmptyState
          title="Nenhum blog cadastrado"
          description="Crie o seu primeiro blog para começar a planejar pautas e automatizar publicações."
          actionLabel="Criar Blog"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {blogs.map((blog) => {
            const toggleWithId = toggleBlogStatusAction.bind(null, blog.id);

            return (
              <Card key={blog.id} className="flex flex-col justify-between">
                <div>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{blog.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1.5 mt-1 font-mono text-xs">
                          <Globe className="h-3.5 w-3.5" />
                          {blog.domain}
                        </CardDescription>
                      </div>
                      <StatusBadge status={blog.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <p className="text-slate-600 dark:text-slate-300 line-clamp-2">
                      {blog.description || "Sem descrição informada."}
                    </p>

                    <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Nicho:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {blog.niche}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Audiência:</span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[160px]">
                          {blog.audience || "Geral"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Languages className="h-3.5 w-3.5" /> Idioma Padrão:
                        </span>
                        <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                          {blog.default_language}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center gap-1">
                          <FolderTree className="h-3.5 w-3.5" /> Categorias:
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {blog.categories?.length || 0} configuradas
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 rounded-b-xl">
                  <form action={toggleWithId}>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-xs gap-1 text-slate-600 hover:text-slate-900"
                    >
                      <Power className="h-3.5 w-3.5" />
                      {blog.status === "active" ? "Desativar" : "Ativar"}
                    </Button>
                  </form>

                  <Link href={`/blogs/${blog.id}`}>
                    <Button variant="outline" size="sm" className="text-xs gap-1">
                      Gerenciar
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

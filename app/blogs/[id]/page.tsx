import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderTree, Languages, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BlogService } from "@/services/blog.service";
import { BlogEditForm } from "@/components/blogs/blog-edit-form";
import { AutopilotSettingsCard } from "@/components/blogs/autopilot-settings-card";

export default async function BlogDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const blog = await BlogService.getBlogById(id).catch(() => null);

  if (!blog) {
    notFound();
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <Link
        href="/blogs"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Blogs
      </Link>

      <PageHeader
        title={`Gerenciar: ${blog.name}`}
        description="Edite os parâmetros do blog, categorias temáticas e idiomas suportados."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Formulário de Edição Principal (2 colunas) */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações Gerais</CardTitle>
              <CardDescription>
                Atualize informações cadastrais e parâmetros operacionais.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BlogEditForm blog={blog} />
            </CardContent>
          </Card>

          {/* Painel Autopilot Settings */}
          <AutopilotSettingsCard blog={blog} />
        </div>

        {/* Informações Laterais: Categorias e Idiomas (1 coluna) */}
        <div className="space-y-6">
          {/* Categorias Cadastradas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-blue-600" />
                Categorias ({blog.categories?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {blog.categories && blog.categories.length > 0 ? (
                blog.categories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex flex-col rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40 text-xs"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {cat.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      /{cat.slug}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">Nenhuma categoria cadastrada.</p>
              )}
            </CardContent>
          </Card>

          {/* Idiomas Ativos */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Languages className="h-4 w-4 text-emerald-600" />
                Idiomas Suportados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {blog.languages && blog.languages.length > 0 ? (
                blog.languages.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/40 text-xs"
                  >
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {l.language}
                    </span>
                    {l.language === blog.default_language ? (
                      <Badge variant="info">Padrão</Badge>
                    ) : (
                      <Badge variant="success">Ativo</Badge>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  {blog.default_language} (Padrão)
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

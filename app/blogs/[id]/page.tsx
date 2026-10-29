import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Languages, CheckCircle2, Settings2, Bot, Share2, FolderTree } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BlogService } from "@/services/blog.service";
import { BlogEditForm } from "@/components/blogs/blog-edit-form";
import { AutopilotSettingsCard } from "@/components/blogs/autopilot-settings-card";
import { SocialPublishingCard } from "@/components/blogs/social-publishing-card";
import { CategoryManager } from "@/components/blogs/category-manager";
import { BlogSettingsTabs } from "@/components/blogs/blog-settings-tabs";
import { getLanguageConfig } from "@/config/languages";
import { BlogWithRelations, WordPressConfig } from "@/types/blog";

export const dynamic = "force-dynamic";

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

  // Never serialize the application password into Client Component props/RSC payloads.
  const editorialConfig = (blog.editorial_config as Record<string, unknown>) || {};
  const wordpressConfig = (editorialConfig.wordpress as WordPressConfig) || {};
  const wordpressPasswordConfigured = Boolean(wordpressConfig.wp_application_password);
  const { wp_application_password: _password, ...safeWordpressConfig } = wordpressConfig;
  const safeBlog: BlogWithRelations = {
    ...blog,
    editorial_config: {
      ...editorialConfig,
      wordpress: safeWordpressConfig,
    },
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <Link
        href="/blogs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para Blogs
      </Link>

      <PageHeader
        title={`Gerenciar: ${blog.name}`}
        description="Edite os parâmetros do blog, categorias temáticas e idiomas suportados."
      />

      <BlogSettingsTabs
        sections={[
          {
            id: "geral",
            label: "Geral",
            description: "Dados do blog e WordPress",
            icon: <Settings2 className="h-4 w-4" />,
            content: (
              <Card>
                <CardHeader>
                  <CardTitle>Configurações Gerais</CardTitle>
                  <CardDescription>
                    Atualize informações cadastrais e parâmetros operacionais.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BlogEditForm blog={safeBlog} wordpressPasswordConfigured={wordpressPasswordConfigured} />
                </CardContent>
              </Card>
            ),
          },
          {
            id: "autopilot",
            label: "Piloto Automático",
            description: "Horários e limite diário",
            icon: <Bot className="h-4 w-4" />,
            badge: blog.autopilot_enabled ? <Badge variant="success">On</Badge> : undefined,
            content: <AutopilotSettingsCard blog={safeBlog} />,
          },
          {
            id: "redes-sociais",
            label: "Redes Sociais",
            description: "Facebook, Instagram, LinkedIn",
            icon: <Share2 className="h-4 w-4" />,
            content: <SocialPublishingCard blog={safeBlog} />,
          },
          {
            id: "categorias",
            label: "Categorias",
            description: "Temas do blog",
            icon: <FolderTree className="h-4 w-4" />,
            badge: <Badge variant="outline">{blog.categories?.length ?? 0}</Badge>,
            content: <CategoryManager blogId={blog.id} categories={blog.categories || []} />,
          },
          {
            id: "idiomas",
            label: "Idiomas",
            description: "Idiomas ativos",
            icon: <Languages className="h-4 w-4" />,
            content: (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Languages className="h-4 w-4 text-success" />
                      Idiomas Suportados
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {blog.languages && blog.languages.length > 0 ? (
                      blog.languages.map((l) => {
                        const cfg = getLanguageConfig(l.language);
                        return (
                          <div
                            key={l.id}
                            className="flex items-center justify-between rounded-brand-btn border border-border bg-[hsl(var(--bg-subtle))] p-2.5 text-xs"
                          >
                            <span className="font-medium text-foreground flex items-center gap-1.5">
                              <span>{cfg.flag}</span>
                              <span>{cfg.name}</span>
                            </span>
                            {l.language === blog.default_language ? (
                              <Badge variant="info">Padrão</Badge>
                            ) : (
                              <Badge variant="success">Ativo</Badge>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                        <span>{getLanguageConfig(blog.default_language).flag}</span>
                        <span>{getLanguageConfig(blog.default_language).name} (Padrão)</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
            ),
          },
        ]}
      />
    </div>
  );
}

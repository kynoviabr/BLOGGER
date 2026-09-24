import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { BlogService } from "@/services/blog.service";
import { IdeasGeneratorView } from "@/components/ideas/ideas-generator-view";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const blogs = await BlogService.listBlogs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gerador de Pautas com IA"
        description="Gere ideias estratégicas de artigos em lote alinhadas ao nicho do seu blog e adicione-as diretamente ao Calendário Editorial."
        actions={
          <Link href="/calendar">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Calendário
            </Button>
          </Link>
        }
      />

      <IdeasGeneratorView blogs={blogs} />
    </div>
  );
}

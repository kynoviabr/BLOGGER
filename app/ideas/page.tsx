import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { BlogService } from "@/services/blog.service";
import { IdeasTabsContainer } from "@/components/ideas/ideas-tabs-container";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const blogs = await BlogService.listBlogs();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Ideação & Pautas"
        description="Cole pautas manuais brutas para refinamento instantâneo por IA ou gere ideias estratégicas em lote alinhadas ao nicho do seu blog."
        actions={
          <Link href="/calendar">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Calendário
            </Button>
          </Link>
        }
      />

      <IdeasTabsContainer blogs={blogs} />
    </div>
  );
}

import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { EditorialFlow } from "@/components/shared/editorial-flow";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { BlogService } from "@/services/blog.service";
import { IdeasTabsContainer, IdeasTab } from "@/components/ideas/ideas-tabs-container";

export const dynamic = "force-dynamic";

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ blogId?: string; tab?: string }>;
}) {
  const { blogId: queryBlogId, tab } = await searchParams;
  const initialTab: IdeasTab = tab === "saved" || tab === "auto" ? tab : "manual";
  const cookieStore = await cookies();
  const cookieBlogId = cookieStore.get("selected_blog_id")?.value;

  const rawBlogId = queryBlogId !== undefined ? queryBlogId : cookieBlogId;
  const blogId = rawBlogId && rawBlogId !== "all" ? rawBlogId : undefined;

  const blogs = await BlogService.listBlogs();
  const activeBlogId = blogId && blogs.some((b) => b.id === blogId) ? blogId : blogs[0]?.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Ideação & Pautas"
        description="Cole pautas manuais brutas para refinamento instantâneo por IA ou gere ideias estratégicas em lote alinhadas ao nicho do seu blog."
        actions={
          <Link href={blogId ? `/calendar?blogId=${blogId}` : "/calendar"}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao Calendário
            </Button>
          </Link>
        }
      />

      <EditorialFlow current="ideas" />

      <IdeasTabsContainer blogs={blogs} initialBlogId={activeBlogId} initialTab={initialTab} />
    </div>
  );
}
